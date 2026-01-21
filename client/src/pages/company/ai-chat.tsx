import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageLayout } from "@/components/layout/page-layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MessageSquare, Send, Loader2, Plus, Trash2 } from "lucide-react";

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

export default function AIChatPage() {
  const { isCompanyAdmin, isAdmin, activeCompany, isCompaniesLoading } = useAuth();
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    enabled: canAccessChat,
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
    return (
      <PageLayout title="AI Assistant">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access restricted to Company Admins and above.</p>
        </div>
      </PageLayout>
    );
  }

  const messages = conversationData?.messages || [];

  return (
    <>
      <Helmet>
        <title>AI Assistant - {activeCompany?.name || "Company"}</title>
      </Helmet>
      <PageLayout title="AI Assistant">
        <div className="flex gap-4 h-[calc(100vh-200px)]">
          <Card className="w-80 flex flex-col">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Conversations</CardTitle>
              <Button
                data-testid="button-new-chat"
                size="icon"
                variant="ghost"
                onClick={handleNewConversation}
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full">
                {conversationsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4 px-3">
                    No conversations yet
                  </p>
                ) : (
                  <div className="p-2 space-y-1">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        data-testid={`conversation-item-${conv.id}`}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          activeConversationId === conv.id
                            ? "bg-primary/10"
                            : "hover-elevate"
                        }`}
                        onClick={() => setActiveConversationId(conv.id)}
                      >
                        <MessageSquare className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1 truncate text-sm">{conv.title}</span>
                        <Button
                          data-testid={`button-delete-${conv.id}`}
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversationMutation.mutate(conv.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-2 border-b flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {conversationData?.conversation?.title || "New Conversation"}
              </CardTitle>
              {activeConversationId && (
                <Button
                  data-testid="button-delete-current"
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteConversationMutation.mutate(activeConversationId)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.length === 0 && !streamingContent && (
                      <div className="text-center text-muted-foreground py-12">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Ask me anything about {activeCompany?.name || "your company"}!</p>
                        <p className="text-sm mt-2">
                          I can help with projects, reports, clients, team members, and more.
                        </p>
                      </div>
                    )}
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-4 py-3 ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                    {streamingContent && (
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-lg px-4 py-3 bg-muted">
                          <div className="whitespace-pre-wrap">
                            {streamingContent}
                            <span className="animate-pulse">|</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="p-4 border-t flex gap-2">
                <Input
                  data-testid="input-chat"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask a question about your company data..."
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  disabled={isStreaming}
                  className="text-base"
                />
                <Button
                  data-testid="button-send"
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
        </div>
      </PageLayout>
    </>
  );
}
