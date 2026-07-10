"use client";

import { useState, useRef } from "react";
import { UploadCloud, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface VoiceClonerProps {
  apiBaseUrl: string;
  apiKey: string;
  onCloneSuccess: (newVoiceId: string) => void;
}

export function VoiceCloner({ apiBaseUrl, apiKey, onCloneSuccess }: VoiceClonerProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "wav" && ext !== "flac" && ext !== "mp3") {
      setStatus("error");
      setMessage("Invalid format. Please upload a WAV, FLAC, or MP3 file.");
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setStatus("idle");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setStatus("loading");
    setMessage("Analyzing audio and compiling voice state (this may take a few seconds)...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());

    try {
      const response = await fetch(`${apiBaseUrl}/v1/voices/clone`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to clone voice.");
      }

      setStatus("success");
      setMessage(`Voice "${name}" successfully compiled and registered!`);
      setName("");
      setFile(null);
      onCloneSuccess(data.voice_id);
      
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setMessage(err.message || "Connection error. Make sure the backend is running.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="w-1.5 h-1.5 bg-highlight rounded-full animate-pulse" />
          Zero-Shot Voice Cloner
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-1.5">
            <Label htmlFor="voice-name">VOICE IDENTITY NAME:</Label>
            <input
              id="voice-name"
              type="text"
              placeholder="e.g. Neo, Trinity, Jarvis"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full shadcn-input py-2.5 px-4 text-sm outline-none transition-all font-sans placeholder:text-muted-foreground/50"
              disabled={status === "loading"}
            />
          </div>

          {/* Drag and drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border border-dashed rounded-md p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
              isDragging 
                ? "border-primary bg-secondary/80" 
                : "border-border hover:border-primary/50 bg-secondary/20 hover:bg-secondary/40"
            } ${status === "loading" ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.flac,.mp3"
              onChange={handleFileChange}
              className="hidden"
            />

            <UploadCloud className={`w-8 h-8 ${isDragging ? "text-primary scale-110" : "text-muted-foreground"} transition-all`} />
            
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">
                {file ? file.name : "Drag & Drop Voice Sample File"}
              </p>
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "WAV, FLAC, MP3 (5 - 15s recommended)"}
              </p>
            </div>
          </div>

          {/* Status display */}
          {message && (
            <div className={`p-3.5 rounded-md text-xs flex gap-2 items-start border ${
              status === "loading" ? "bg-highlight-glow border-highlight/20 text-foreground" :
              status === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
              status === "error" ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400" :
              "bg-secondary text-muted-foreground border-border"
            }`}>
              {status === "loading" && <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />}
              {status === "success" && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              {status === "error" && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span className="font-sans leading-tight">{message}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={status === "loading" || !file || !name.trim()}
            className="w-full"
          >
            {status === "loading" ? "Compiling..." : "Register & Clone Voice"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
