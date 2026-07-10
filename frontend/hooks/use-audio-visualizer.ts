"use client";

import { useEffect, useRef, useState } from "react";

export interface AudioVisualizerHook {
  isPlaying: boolean;
  error: string | null;
  analyser: AnalyserNode | null;
  playStream: (url: string) => void;
  stop: () => void;
  audioElement: HTMLAudioElement | null;
  clearError: () => void;
}

export function useAudioVisualizer(): AudioVisualizerHook {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    // Instantiate background HTML5 Audio element
    const audio = new Audio();
    audio.crossOrigin = "anonymous"; // Enable cross-origin streams
    audioRef.current = audio;

    const handlePlay = () => {
      setIsPlaying(true);
      setError(null);
    };
    
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    
    const handleError = async () => {
      setIsPlaying(false);
      const src = audio.src;
      if (!src) return;

      // Extract error details by fetching the endpoint directly
      try {
        let errorUrl = src;
        try {
          const urlObj = new URL(src);
          urlObj.searchParams.set("stream", "false");
          errorUrl = urlObj.toString();
        } catch (_) {}

        const res = await fetch(errorUrl);
        if (!res.ok) {
          const data = await res.json();
          setError(data.detail || `Server returned error status code: ${res.status}`);
        } else {
          setError("Audio playback failed due to a source or decoding error.");
        }
      } catch (err) {
        setError("Network error or server unreachable. Make sure the backend is online.");
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const playStream = (url: string) => {
    if (!audioRef.current) return;
    setError(null);

    // Lazy load the Web Audio context on the first user interaction
    if (!audioContextRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;
        
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
      } catch (e) {
        console.error("Failed to initialize Web Audio context:", e);
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }

    audioRef.current.src = url;
    audioRef.current.load();
    audioRef.current.play().catch(err => {
      // play() can fail if browser blocks autoplay before interaction, handle it silently
      console.warn("Audio play() deferred:", err);
    });
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const clearError = () => setError(null);

  return {
    isPlaying,
    error,
    analyser: analyserRef.current,
    playStream,
    stop,
    audioElement: audioRef.current,
    clearError
  };
}
