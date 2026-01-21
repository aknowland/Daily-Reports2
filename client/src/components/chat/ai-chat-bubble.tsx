import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MessageSquare, X, Send, Loader2, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export function AIChatBubble() {
  const { isCompanyAdmin, isAdmin, activeCompany, isCompaniesLoading } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Allow access for Company Admins or any System Admin level (admin, owner, system_owner)
  // Wait for companies to load before determining access
  const canAccessChat = !isCompaniesLoading && (isCompanyAdmin || isAdmin);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/ai-chat/conversations", activeCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/ai-chat/conversations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    enabled: canAccessChat && isOpen,
  });

  const { data: conversationData, isLoading: messagesLoading } = useQuery<{
    conversation: Conversation;
    messages: Message[];
  }>({
    queryKey: ["/api/ai-chat/conversations", activeConversationId],
    queryFn: async () => {
      const res = await fetch(`/api/ai-chat/conversations/${activeConversationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!activeConversationId,
  });

  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/ai-chat/conversations", { title });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-chat/conversations"] });
    },
    onError: () => {
      toast({ title: "Failed to create conversation", variant: "destructive" });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai-chat/conversations/${id}`);
    },
    onSuccess: () => {
      setActiveConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-chat/conversations"] });
    },
    onError: () => {
      toast({ title: "Failed to delete conversation", variant: "destructive" });
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationData?.messages, streamingContent]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const messageContent = inputValue.trim();
    setInputValue("");

    let conversationId = activeConversationId;
    
    if (!conversationId) {
      const title = messageContent.slice(0, 50) + (messageContent.length > 50 ? "..." : "");
      const newConversation = await createConversationMutation.mutateAsync(title);
      conversationId = newConversation.id;
    }

    setIsStreaming(true);
    setStreamingContent("");

    try {
      const response = await fetch(`/api/ai-chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: messageContent }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setStreamingContent(fullContent);
                }
              } catch {
                // Non-JSON data, skip
              }
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/ai-chat/conversations", conversationId] });
    } catch (error) {
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
  };

  if (!canAccessChat) {
    return null;
  }

  const messages = conversationData?.messages || [];

  return (
    <>
      {!isOpen && (
        <Button
          data-testid="button-chat-bubble"
          onClick={() => setIsOpen(true)}
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      )}

      {isOpen && (
        <Card className="fixed bottom-6 right-6 z-50 w-96 h-[500px] shadow-xl flex flex-col">
          <CardHeader className="pb-2 border-b flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              AI Assistant
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                data-testid="button-new-conversation"
                size="icon"
                variant="ghost"
                onClick={handleNewConversation}
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
              {activeConversationId && (
                <Button
                  data-testid="button-delete-conversation"
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteConversationMutation.mutate(activeConversationId)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                data-testid="button-close-chat"
                size="icon"
                variant="ghost"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
            {!activeConversationId && conversations.length > 0 && (
              <div className="p-3 border-b">
                <p className="text-sm text-muted-foreground mb-2">Recent conversations:</p>
                <ScrollArea className="h-24">
                  {conversations.slice(0, 5).map((conv) => (
                    <div
                      key={conv.id}
                      data-testid={`conversation-item-${conv.id}`}
                      className="text-sm py-1 px-2 hover-elevate cursor-pointer rounded truncate"
                      onClick={() => setActiveConversationId(conv.id)}
                    >
                      {conv.title}
                    </div>
                  ))}
                </ScrollArea>
                <Link href="/company/chat" className="text-sm text-primary hover:underline mt-2 block">
                  View all conversations
                </Link>
              </div>
            )}

            <ScrollArea className="flex-1 p-3" ref={scrollAreaRef}>
              {messagesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.length === 0 && !streamingContent && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      <p>Ask me anything about {activeCompany?.name || "your company"}!</p>
                      <p className="text-xs mt-2">I can help with projects, reports, clients, and more.</p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {streamingContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-muted">
                        {streamingContent}
                        <span className="animate-pulse">|</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="p-3 border-t flex gap-2">
              <Input
                data-testid="input-chat-message"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                disabled={isStreaming}
              />
              <Button
                data-testid="button-send-message"
                size="icon"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isStreaming}
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
