import { useState, useRef, useEffect, useCallback } from "react";
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
import { MessageSquare, Send, Loader2, Mic, MicOff } from "lucide-react";

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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Allow access for Company Admins or any System Admin level (admin, owner, system_owner)
  // Wait for companies to load before determining access
  const canAccessChat = !isCompaniesLoading && (isCompanyAdmin || isAdmin);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationData?.messages, streamingContent]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({ title: "Could not access microphone", variant: "destructive" });
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];
        const response = await fetch("/api/ai-chat/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ audio: base64Audio, format: "webm" }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.text) {
            setInputValue((prev) => prev + (prev ? " " : "") + data.text);
          }
        } else {
          toast({ title: "Failed to transcribe audio", variant: "destructive" });
        }
        setIsTranscribing(false);
      };
    } catch (error) {
      toast({ title: "Failed to transcribe audio", variant: "destructive" });
      setIsTranscribing(false);
    }
  };

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
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                AI Assistant
              </CardTitle>
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
                      <div className="text-center text-muted-foreground py-8">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Ask me anything about {activeCompany?.name || "your company"}!</p>
                        <p className="text-sm mt-2 mb-6">
                          I can help with projects, reports, clients, team members, and more.
                        </p>
                        <div className="max-w-md mx-auto space-y-2">
                          <p className="text-xs uppercase tracking-wide mb-3">Try asking:</p>
                          {[
                            "How many active projects do we have?",
                            "Who submitted reports this week?",
                            "List all our clients",
                            "What's the status of our team members?",
                            "Summarize recent daily reports",
                          ].map((question) => (
                            <button
                              key={question}
                              data-testid={`sample-question-${question.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`}
                              className="w-full text-left px-4 py-3 rounded-lg border bg-card hover-elevate text-sm text-foreground transition-colors"
                              onClick={() => {
                                setInputValue(question);
                              }}
                            >
                              {question}
                            </button>
                          ))}
                        </div>
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
                <Button
                  data-testid="button-mic"
                  size="icon"
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isStreaming || isTranscribing}
                  title={isRecording ? "Stop recording" : "Start voice input"}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Input
                  data-testid="input-chat"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isRecording ? "Listening..." : "Ask a question or use voice input..."}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  disabled={isStreaming || isRecording}
                  className="text-base"
                />
                <Button
                  data-testid="button-send"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isStreaming || isRecording}
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
