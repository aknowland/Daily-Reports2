import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

type RecordingState = "idle" | "recording" | "transcribing";

const MAX_RECORDING_SECONDS = 120;

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onParsedData?: (data: unknown) => void;
  targetField?: "raw" | "workActivities" | "visitors" | "weather";
  disabled?: boolean;
  className?: string;
  inHeader?: boolean;
}

export function VoiceInput({
  onTranscript,
  onParsedData,
  targetField = "raw",
  disabled = false,
  className,
  inHeader = false,
}: VoiceInputProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state === "recording") {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            stopRecording();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setState("recording");
    } catch (err) {
      setError("Could not access microphone. Please allow microphone permissions.");
      console.error("Recording error:", err);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }

    setState("transcribing");

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        
        try {
          const base64 = await blobToBase64(audioBlob);
          
          const transcribeRes = await apiRequest("POST", "/api/transcribe", {
            audio: base64,
            format: "webm",
          });
          const transcribeData = await transcribeRes.json();
          
          if (!transcribeData.transcript) {
            setError("Could not transcribe audio. Please try again.");
            setState("idle");
            resolve();
            return;
          }

          const transcript = transcribeData.transcript;
          onTranscript(transcript);

          if (targetField !== "raw" && onParsedData) {
            try {
              const parseRes = await apiRequest("POST", "/api/parse-report-voice", {
                transcript,
                targetField,
              });
              const parseData = await parseRes.json();
              
              if (parseData.data) {
                onParsedData(parseData.data);
              }
            } catch (parseErr) {
              console.error("Parse error:", parseErr);
            }
          }
          
          setState("idle");
        } catch (err) {
          setError("Failed to transcribe audio. Please try again.");
          console.error("Transcription error:", err);
          setState("idle");
        }
        
        resolve();
      };

      recorder.stop();
    });
  }, [onTranscript, onParsedData, targetField]);

  const toggleRecording = useCallback(() => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      startRecording();
    }
  }, [state, startRecording, stopRecording]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={state === "recording" ? "destructive" : "outline"}
        size="icon"
        onClick={toggleRecording}
        disabled={disabled || state === "transcribing"}
        className={cn(
          "shrink-0 transition-all",
          state === "recording" && "animate-pulse",
          inHeader && state !== "recording" && "border-primary-foreground/50 text-primary-foreground"
        )}
        data-testid="button-voice-input"
      >
        {state === "transcribing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : state === "recording" ? (
          <Square className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>
      
      {state === "recording" && (
        <span className={cn(
          "text-sm animate-pulse",
          inHeader ? "text-primary-foreground" : "text-destructive"
        )}>
          {recordingTime}s / {MAX_RECORDING_SECONDS}s - Tap to stop
        </span>
      )}
      
      {state === "transcribing" && (
        <span className={cn(
          "text-sm",
          inHeader ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          Transcribing...
        </span>
      )}
      
      {error && (
        <span className={cn(
          "text-sm",
          inHeader ? "text-primary-foreground" : "text-destructive"
        )}>
          {error}
        </span>
      )}
    </div>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const data = base64.split(",")[1];
      resolve(data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface VoiceTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  "data-testid"?: string;
}

export function VoiceTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  className,
  "data-testid": testId,
}: VoiceTextInputProps) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={cn(
            "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y",
            className
          )}
          data-testid={testId}
        />
      </div>
      <VoiceInput
        onTranscript={(text) => {
          const newValue = value ? `${value} ${text}` : text;
          onChange(newValue);
        }}
        disabled={disabled}
      />
    </div>
  );
}
