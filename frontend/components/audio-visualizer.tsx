"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isPlaying: boolean;
  analyser: AnalyserNode | null;
}

export function AudioVisualizer({ isPlaying, analyser }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const idleTimeRef = useRef<number>(0);
  
  // Smoothing states to interpolate frequencies (prevents visual jitter)
  const smoothedLows = useRef<number>(0);
  const smoothedMids = useRef<number>(0);
  const smoothedHighs = useRef<number>(0);
  
  // Blend factor to smoothly transition between IDLE (0.0) and PLAYING (1.0) states
  const blendFactor = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const cy = height / 2;

      const isDark = document.documentElement.classList.contains("dark");
      
      // Paint visualizer screen canvas base (Matching light/dark theme card well backgrounds)
      ctx.fillStyle = isDark ? "rgba(9, 10, 11, 0.28)" : "rgba(253, 244, 235, 0.55)";
      ctx.fillRect(0, 0, width, height);

      // Access active theme colors dynamically
      const styles = window.getComputedStyle(document.body);
      const colorPrimary = styles.getPropertyValue("--highlight").trim() || "#e05a2b";
      const colorSecondary = styles.getPropertyValue("--highlight-sec").trim() || "#3b82f6";
      const colorTeal = "#14b8a6"; // Neon cyan accent for consonant detail

      // Smoothly blend states (prevent sharp visual jumps)
      const targetBlend = isPlaying && analyser ? 1.0 : 0.0;
      blendFactor.current += (targetBlend - blendFactor.current) * 0.06;
      const blend = blendFactor.current;

      // 1. Read FFT and modulate energy
      let lows = 0;
      let mids = 0;
      let highs = 0;

      if (isPlaying && analyser) {
        analyser.getByteFrequencyData(dataArray);

        let sumLows = 0;
        let sumMids = 0;
        let sumHighs = 0;

        for (let i = 0; i < 8; i++) sumLows += dataArray[i];
        for (let i = 8; i < 32; i++) sumMids += dataArray[i];
        for (let i = 32; i < 64; i++) sumHighs += dataArray[i];

        const avgLows = sumLows / 8 / 255;
        const avgMids = sumMids / 24 / 255;
        const avgHighs = sumHighs / 32 / 255;

        smoothedLows.current += (avgLows - smoothedLows.current) * 0.18;
        smoothedMids.current += (avgMids - smoothedMids.current) * 0.18;
        smoothedHighs.current += (avgHighs - smoothedHighs.current) * 0.18;
      } else {
        // Standby breathing values
        smoothedLows.current += (0.02 - smoothedLows.current) * 0.08;
        smoothedMids.current += (0.02 - smoothedMids.current) * 0.08;
        smoothedHighs.current += (0.005 - smoothedHighs.current) * 0.08;
      }

      lows = smoothedLows.current;
      mids = smoothedMids.current;
      highs = smoothedHighs.current;

      idleTimeRef.current += 0.015 + mids * 0.04;
      const time = idleTimeRef.current;

      // 2. Draw Horizontal zero-line guideline
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(224, 90, 43, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      // 3. Draw Fading Background Spectrum Equalizer Bars (Layer 1 Background Behind Waves)
      if (blend > 0.01) {
        const numBars = 36;
        const barGap = 4;
        const barWidth = (width / numBars) - barGap;
        
        ctx.globalAlpha = blend * (isDark ? 0.08 : 0.12);
        
        // Equalizer uses a gradient blending saffron and blue
        const barGrad = ctx.createLinearGradient(0, 0, width, 0);
        barGrad.addColorStop(0, colorPrimary);
        barGrad.addColorStop(0.5, colorSecondary);
        barGrad.addColorStop(1, colorPrimary);
        ctx.fillStyle = barGrad;

        for (let i = 0; i < numBars; i++) {
          // Map bar index to frequency array (folding symmetrically)
          const dataIndex = Math.floor((Math.abs(numBars / 2 - i) / (numBars / 2)) * (bufferLength * 0.45));
          const val = dataArray[dataIndex] / 255;
          
          // Smoothed height with taper edges
          const edgeTaper = Math.sin((i / numBars) * Math.PI);
          const barHeight = val * (height * 0.6) * edgeTaper;
          const x = i * (barWidth + barGap) + barGap / 2;
          const y = cy - barHeight / 2;

          ctx.fillRect(x, y, barWidth, barHeight);
        }
        ctx.globalAlpha = 1.0; // Reset
      }

      // 4. Render Overlapping Waveforms with Shape-Warping on Words
      // Wave 1: Lows (Bass) -> Saffron primary wave
      const activeAmp1 = 15 + lows * 40;
      const idleAmp1 = 6;
      const amp1 = idleAmp1 * (1.0 - blend) + activeAmp1 * blend;

      // Wave 2: Mids (Vocals) -> Blue secondary wave
      const activeAmp2 = 10 + mids * 30;
      const idleAmp2 = 10;
      const amp2 = idleAmp2 * (1.0 - blend) + activeAmp2 * blend;

      // Wave 3: Highs (Detail) -> Thin Cyan micro-wave
      const activeAmp3 = 4 + highs * 18;
      const idleAmp3 = 3;
      const amp3 = idleAmp3 * (1.0 - blend) + activeAmp3 * blend;

      const waveSpecs = [
        {
          amplitude: amp1,
          freq: 0.01,
          speed: 1.0,
          color: colorPrimary,
          opacity: isDark ? 0.65 : 0.75,
          lineWidth: 2.2,
          glow: 12
        },
        {
          amplitude: amp2,
          freq: 0.016,
          speed: -0.7,
          color: colorSecondary,
          opacity: isDark ? 0.5 : 0.6,
          lineWidth: 1.6,
          glow: 8
        },
        {
          amplitude: amp3,
          freq: 0.026,
          speed: 1.5,
          color: colorTeal,
          opacity: isDark ? 0.75 : 0.85,
          lineWidth: 1.0,
          glow: 4
        }
      ];

      waveSpecs.forEach((w) => {
        ctx.beginPath();
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.lineWidth;
        ctx.globalAlpha = w.opacity;
        ctx.shadowBlur = w.glow;
        ctx.shadowColor = w.color;

        // Add dynamic frequency and phase-warp multipliers based on speech bands
        const freqWarp = w.freq + highs * 0.008 * blend; // Wavelength warps on sibilance
        const phaseWarp = time * w.speed + mids * Math.PI * 0.4 * blend; // Phase shifts on vocal power

        for (let x = 0; x < width; x++) {
          const edgeTaper = Math.sin((x / width) * Math.PI);
          
          // Map coordinate directly to real-time FFT spectrum displacement
          const fftIndex = Math.floor((x / width) * (bufferLength * 0.3));
          const rawWobble = (dataArray[fftIndex] / 255) * 8 * edgeTaper * blend;
          
          // Mathematical synthesis: sine path + micro-wobbles from raw audio frequencies
          const y = cy + 
            Math.sin(x * freqWarp - phaseWarp) * w.amplitude * edgeTaper + 
            rawWobble * Math.sin(x * 0.08 + time * 3);
          
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      // Reset canvas parameters
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, analyser]);

  return (
    <div className="relative w-full h-36 overflow-hidden flex items-center justify-center group select-none">
      {/* Decorative futuristic scan grid layer */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:12px_14px] pointer-events-none" />
      
      {/* Scope bracket crosshairs */}
      <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-white/10 group-hover:border-primary/30 transition-all duration-300" />
      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-white/10 group-hover:border-primary/30 transition-all duration-300" />
      <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 border-b border-l border-white/10 group-hover:border-primary/30 transition-all duration-300" />
      <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 border-b border-r border-white/10 group-hover:border-primary/30 transition-all duration-300" />

      {/* Renders actual canvas */}
      <canvas ref={canvasRef} className="w-full h-full block z-10" />

      {/* Status HUD readout overlay */}
      <div className="absolute bottom-2.5 left-3.5 text-[8px] font-mono tracking-widest text-white/40 dark:text-white/40 select-none flex items-center gap-1.5 z-20">
        <span className={`w-1 h-1 rounded-full ${isPlaying ? "bg-primary animate-ping" : "bg-white/20"} inline-block`} />
        {isPlaying ? "COGNITIVE SYNTHESIS WAVEFORM ACTIVE..." : "COGNITIVE CORE STANDBY // IDLE..."}
      </div>
    </div>
  );
}
