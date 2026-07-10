"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Play, Square, Volume2, RefreshCw, Layers, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

export interface VoiceItem {
  id: string;
  display_name: string;
  source: string;
  cloning_required: boolean;
}

interface SpeakerGroup {
  id: string;
  displayName: string;
  source: string;
  emotions: Record<string, string>; // e.g. { "default": "voice-zero/alan", "happy": "voice-zero/alan-happy" }
}

interface TTSControlPanelProps {
  apiBaseUrl: string;
  isPlaying: boolean;
  voices: VoiceItem[];
  isLoadingVoices: boolean;
  onRefreshVoices: () => void;
  onPlay: (options: {
    input: string;
    voice: string;
    responseFormat: string;
    speed: number;
    stream: boolean;
  }) => void;
  onStop: () => void;
}

export function TTSControlPanel({
  apiBaseUrl,
  isPlaying,
  voices,
  isLoadingVoices,
  onRefreshVoices,
  onPlay,
  onStop,
}: TTSControlPanelProps) {
  const [text, setText] = useState(
    "Hello! Welcome to the Shero text to speech engine. Enjoy the low latency streaming audio!"
  );
  
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("alba");
  const [selectedEmotion, setSelectedEmotion] = useState("default");
  const [responseFormat, setResponseFormat] = useState("mp3");
  const [speed, setSpeed] = useState(1.0);
  const [stream, setStream] = useState(true);

  // Group voices into speakers with sub-emotions
  const speakerGroups = useMemo((): Record<string, SpeakerGroup> => {
    const groups: Record<string, SpeakerGroup> = {};

    voices.forEach((voice) => {
      let speakerId = voice.id;
      let emotion = "default";
      let baseDisplayName = voice.display_name;

      if (voice.id.startsWith("voice-zero/")) {
        const rawName = voice.id.substring("voice-zero/".length);
        if (rawName.includes("-")) {
          const lastDashIndex = rawName.lastIndexOf("-");
          const speakerName = rawName.substring(0, lastDashIndex);
          const emotionName = rawName.substring(lastDashIndex + 1);
          speakerId = `voice-zero/${speakerName}`;
          emotion = emotionName;
          baseDisplayName = speakerName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        } else {
          speakerId = voice.id;
          emotion = "default";
        }
      }

      if (!groups[speakerId]) {
        groups[speakerId] = {
          id: speakerId,
          displayName: baseDisplayName.replace(" (Voice-Zero)", "").replace(" (Emotional)", ""),
          source: voice.source.replace(" (Emotional)", ""),
          emotions: {}
        };
      }

      groups[speakerId].emotions[emotion] = voice.id;
    });

    return groups;
  }, [voices]);

  // Sync state if selected speaker doesn't exist
  useEffect(() => {
    if (Object.keys(speakerGroups).length > 0 && !speakerGroups[selectedSpeakerId]) {
      const keys = Object.keys(speakerGroups);
      if (keys.includes("alba")) {
        setSelectedSpeakerId("alba");
      } else {
        setSelectedSpeakerId(keys[0]);
      }
      setSelectedEmotion("default");
    }
  }, [speakerGroups, selectedSpeakerId]);

  // Handle speaker change
  const handleSpeakerChange = (speakerId: string) => {
    setSelectedSpeakerId(speakerId);
    
    const group = speakerGroups[speakerId];
    if (group) {
      const emotions = Object.keys(group.emotions);
      if (emotions.includes("default")) {
        setSelectedEmotion("default");
      } else if (emotions.length > 0) {
        setSelectedEmotion(emotions[0]);
      }
    }
  };

  // Get active voice ID to play
  const activeVoiceId = useMemo(() => {
    const group = speakerGroups[selectedSpeakerId];
    if (!group) return selectedSpeakerId;
    return group.emotions[selectedEmotion] || Object.values(group.emotions)[0] || selectedSpeakerId;
  }, [speakerGroups, selectedSpeakerId, selectedEmotion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    if (isPlaying) {
      onStop();
    } else {
      onPlay({
        input: text.trim(),
        voice: activeVoiceId,
        responseFormat,
        speed,
        stream,
      });
    }
  };

  // Group speaker ids by source categories for dropdown
  const groupedSpeakerIds = useMemo(() => {
    const cats: Record<string, string[]> = {};
    Object.values(speakerGroups).forEach((group) => {
      const src = group.source;
      if (!cats[src]) cats[src] = [];
      cats[src].push(group.id);
    });
    return cats;
  }, [speakerGroups]);

  // Get list of emotions for currently selected speaker
  const currentEmotions = useMemo(() => {
    const group = speakerGroups[selectedSpeakerId];
    return group ? Object.keys(group.emotions).sort() : ["default"];
  }, [speakerGroups, selectedSpeakerId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          <Sparkles className="w-4 h-4 text-highlight animate-pulse" />
          Neural Synthesis Playground
        </CardTitle>
        
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onRefreshVoices}
          disabled={isLoadingVoices}
          className="h-8 w-8 text-muted-foreground"
          title="Refresh Voices Catalog"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVoices ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Speech Text Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="tts-text">SYNTHESIS SPEECH INPUT:</Label>
              <span className="text-[9px] font-mono text-muted-foreground">{text.length} / 100</span>
            </div>
            <Textarea
              id="tts-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 100))}
              placeholder="Enter text to synthesize here..."
              required
              maxLength={100}
              disabled={isPlaying}
            />
          </div>

          {/* Group dropdown options side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Speaker Select */}
            <div className="space-y-1.5">
              <Label htmlFor="tts-speaker" className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-highlight-sec" />
                SPEAKER VOICE MODEL:
              </Label>
              <div className="relative shadcn-input">
                <select
                  id="tts-speaker"
                  value={selectedSpeakerId}
                  onChange={(e) => handleSpeakerChange(e.target.value)}
                  className="w-full bg-transparent py-2.5 pl-4 pr-10 text-sm text-foreground outline-none appearance-none cursor-pointer font-sans"
                  disabled={isPlaying || isLoadingVoices}
                >
                  {isLoadingVoices ? (
                    <option value="" disabled>Loading Voices...</option>
                  ) : Object.keys(speakerGroups).length === 0 ? (
                    <option value="" disabled>No Voices Found</option>
                  ) : (
                    Object.entries(groupedSpeakerIds).map(([source, ids]) => (
                      <optgroup label={source.toUpperCase()} key={source} className="font-mono text-[9px] bg-background">
                        {ids.map((id) => (
                          <option value={id} key={id} className="font-sans text-sm bg-background">
                            {speakerGroups[id].displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
                <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-muted-foreground">
                  <Layers className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Format Select */}
            <div className="space-y-1.5">
              <Label htmlFor="tts-format">AUDIO STREAM FORMAT:</Label>
              <div className="relative shadcn-input">
                <select
                  id="tts-format"
                  value={responseFormat}
                  onChange={(e) => setResponseFormat(e.target.value)}
                  className="w-full bg-transparent py-2.5 px-4 text-sm text-foreground outline-none appearance-none cursor-pointer font-sans"
                  disabled={isPlaying}
                >
                  <option value="mp3" className="bg-background">MPEG-3 (.mp3) - Compressed</option>
                  <option value="wav" className="bg-background">Waveform (.wav) - Lossless PCM</option>
                  <option value="pcm" className="bg-background">Headerless PCM (.pcm) - Raw Bytes</option>
                </select>
                <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-muted-foreground">
                  <span className="text-[9px] font-mono border border-border/80 px-1.5 py-0.5 rounded">24kHz</span>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC EMOTION PILLS */}
          {currentEmotions.length > 1 && (
            <div className="space-y-2.5 p-3.5 rounded-md border border-border/50 bg-secondary/30">
              <Label className="text-[8px]">Available Emotional Variations:</Label>
              <div className="flex flex-wrap gap-2">
                {currentEmotions.map((emotion) => (
                  <button
                    type="button"
                    key={emotion}
                    onClick={() => setSelectedEmotion(emotion)}
                    className={`py-1 px-3.5 rounded-md text-[11px] font-semibold font-sans tracking-wide transition-all duration-150 cursor-pointer outline-none border ${
                      selectedEmotion === emotion
                        ? "bg-primary text-primary-foreground border-primary shadow"
                        : "bg-secondary text-secondary-foreground border-border hover:bg-accent hover:text-accent-foreground"
                    }`}
                    disabled={isPlaying}
                  >
                    {emotion.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resampled Rate Slider */}
          <div className="space-y-2.5 p-3.5 rounded-md border border-border/50 bg-secondary/30">
            <div className="flex justify-between text-[9px] font-bold font-mono text-muted-foreground tracking-widest">
              <Label>RESAMPLED SPEECH RATE:</Label>
              <span className="text-highlight font-black">{speed.toFixed(2)}x</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono text-muted-foreground select-none">0.5x</span>
              <Slider
                min={0.5}
                max={2.0}
                step={0.05}
                value={[speed]}
                onValueChange={(val) => setSpeed(val[0])}
                disabled={isPlaying}
                className="w-full py-1.5"
              />
              <span className="text-[9px] font-mono text-muted-foreground select-none">2.0x</span>
            </div>
          </div>

          {/* Realtime Streaming Checkbox */}
          <div className="flex items-center gap-2.5 pt-1 select-none">
            <input
              id="tts-stream"
              type="checkbox"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-secondary text-primary focus:ring-primary/20 accent-primary cursor-pointer outline-none"
              disabled={isPlaying}
            />
            <Label htmlFor="tts-stream" className="cursor-pointer text-[9px]">
              ENABLE REALTIME CHUNK STREAMING (LOW-LATENCY)
            </Label>
          </div>

          {/* Initiate Synthesis Control Button */}
          <Button
            type="submit"
            variant={isPlaying ? "destructive" : "default"}
            className="w-full flex items-center justify-center gap-2"
          >
            {isPlaying ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                Terminate Synthesis Broadcast
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Initiate TTS Generation
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
