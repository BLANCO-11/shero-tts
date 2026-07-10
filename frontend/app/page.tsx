"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AudioVisualizer } from "@/components/audio-visualizer";
import { TTSControlPanel, VoiceItem } from "@/components/tts-control-panel";
import { VoiceCloner } from "@/components/voice-cloner";
import { useAudioVisualizer } from "@/hooks/use-audio-visualizer";
import { Server, Cpu, Disc, AlertTriangle, XCircle, Settings, ShieldAlert, Key, Clipboard, Trash, LogOut, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE_URL = "/api";

interface TokenItem {
  id: number;
  masked_token: string;
  name: string;
  created_at: string;
  status: string;
}

export default function Dashboard() {
  const { isPlaying, error, analyser, playStream, stop, clearError } = useAudioVisualizer();
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [cloningStatus, setCloningStatus] = useState<"loading" | "enabled" | "disabled">("loading");
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [serverStats, setServerStats] = useState({
    cachedStates: 0,
    modelName: "N/A"
  });

  // Authentication & API Key States
  const [apiKey, setApiKey] = useState("");
  const [authError, setAuthError] = useState(false);

  // Admin Portal States
  const [showAdminPortal, setShowAdminPortal] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);
  const [tokensList, setTokensList] = useState<TokenItem[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Load saved credentials from localStorage/sessionStorage
  useEffect(() => {
    const savedKey = localStorage.getItem("shero_api_key") || "sh_demo_key_unlimited";
    setApiKey(savedKey);
    const savedAdminToken = sessionStorage.getItem("shero_admin_token") || "";
    if (savedAdminToken) {
      setAdminToken(savedAdminToken);
    }
  }, []);

  // Sync state with fetch calls when API key updates
  useEffect(() => {
    if (apiKey) {
      fetchVoices();
    }
  }, [apiKey]);

  // Load tokens list when admin registers/logs in
  useEffect(() => {
    if (adminToken) {
      fetchTokens();
    } else {
      setTokensList([]);
    }
  }, [adminToken]);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    setAuthError(false);
    try {
      // 1. Fetch Backend health status (No auth required)
      const healthRes = await fetch(`${API_BASE_URL}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setBackendStatus("online");
        setCloningStatus(healthData.cloning_capability === "enabled" ? "enabled" : "disabled");
        setServerStats({
          cachedStates: healthData.cached_voice_states,
          modelName: healthData.loaded_model
        });
      } else {
        setBackendStatus("offline");
      }

      // 2. Fetch voices catalog (Auth Required)
      const voicesRes = await fetch(`${API_BASE_URL}/v1/voices`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      
      if (voicesRes.status === 401) {
        setAuthError(true);
        setVoices([]);
      } else if (voicesRes.ok) {
        const data = await voicesRes.json();
        setVoices(data.voices || []);
      }
    } catch (err) {
      console.error("Failed to connect to Shero-TTS backend:", err);
      setBackendStatus("offline");
      setCloningStatus("disabled");
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const handlePlay = (options: {
    input: string;
    voice: string;
    responseFormat: string;
    speed: number;
    stream: boolean;
  }) => {
    const params = new URLSearchParams({
      input: options.input,
      voice: options.voice,
      response_format: options.responseFormat,
      speed: options.speed.toString(),
      stream: options.stream.toString(),
      token: apiKey // Append token to query parameter for browser native Audio tag auth
    });

    const streamUrl = `${API_BASE_URL}/v1/audio/speech?${params.toString()}`;
    playStream(streamUrl);
  };

  // ==================== Admin & Token Actions ====================

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setIsAdminLoggingIn(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Admin authentication failed.");
      }

      setAdminToken(data.session_token);
      sessionStorage.setItem("shero_admin_token", data.session_token);
      setAdminUsername("");
      setAdminPassword("");
    } catch (err: any) {
      setAdminError(err.message || "Connection error. Make sure backend is running.");
    } finally {
      setIsAdminLoggingIn(false);
    }
  };

  const fetchTokens = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tokens`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTokensList(data.tokens || []);
      }
    } catch (err) {
      console.error("Failed to load tokens:", err);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/admin/tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({ name: newTokenName.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        setNewlyGeneratedToken(data.token);
        setNewTokenName("");
        fetchTokens();
      }
    } catch (err) {
      console.error("Token creation failed:", err);
    }
  };

  const handleRevokeToken = async (id: number) => {
    if (!confirm("Are you sure you want to revoke and delete this API Token? Any application using this key will immediately lose access.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tokens/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      if (res.ok) {
        fetchTokens();
      }
    } catch (err) {
      console.error("Token revocation failed:", err);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/admin/logout`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
    } catch (e) {}

    setAdminToken("");
    sessionStorage.removeItem("shero_admin_token");
    setNewlyGeneratedToken(null);
  };

  const saveApiKey = (key: string) => {
    const cleanKey = key.trim() || "sh_demo_key_unlimited";
    setApiKey(cleanKey);
    localStorage.setItem("shero_api_key", cleanKey);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-transparent">
      
      {/* LAYER 1: DECORATIVE FLOATING AMBIENT ORBS */}
      <div className="shadcn-blob animate-drift-one top-20 left-10 w-[450px] h-[450px]" style={{ backgroundColor: 'var(--orb-one)' }} />
      <div className="shadcn-blob animate-drift-two bottom-40 right-20 w-[550px] h-[550px]" style={{ backgroundColor: 'var(--orb-two)' }} />
      <div className="shadcn-blob animate-drift-one top-1/2 left-1/3 w-[350px] h-[350px]" style={{ backgroundColor: 'var(--orb-three)' }} />

      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.01)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* INNER WRAPPER */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-5 md:p-8 flex flex-col gap-6 md:gap-8 z-10">
        
        {/* HEADER SECTION */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-border pb-6 relative">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-highlight animate-ping" />
              <h1 className="text-lg md:text-xl font-bold tracking-widest uppercase font-mono bg-gradient-to-r from-foreground via-highlight to-highlight-sec bg-clip-text text-transparent">
                Shero-TTS Control Center
              </h1>
            </div>
            <p className="text-[9px] text-muted-foreground font-mono tracking-widest uppercase opacity-75">
              Neural Cognitive Synthesizer // Database Auth-Gated Interface
            </p>
          </div>

          {/* HUD Readout Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              variant="outline" 
              className={`h-7 px-3 text-[9px] font-mono font-bold tracking-wider flex items-center gap-1.5 border-border ${
                showAdminPortal ? "bg-primary border-primary text-white" : "bg-secondary text-secondary-foreground"
              }`}
              onClick={() => setShowAdminPortal(!showAdminPortal)}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              ADMIN PORTAL {adminToken && "🔑"}
            </Button>

            <div className={`py-1.5 px-3.5 rounded-md border text-[9px] font-mono font-bold tracking-wider flex items-center gap-1.5 shadow-sm ${
              backendStatus === "online" 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                : backendStatus === "checking"
                ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
            }`}>
              <Server className="w-3.5 h-3.5" />
              {backendStatus === "online" ? "BACKEND ONLINE" : backendStatus === "checking" ? "PINGING NODE..." : "NODE OFFLINE"}
            </div>

            <div className="py-1.5 px-3.5 rounded-md border border-border bg-secondary text-secondary-foreground text-[9px] font-mono font-bold tracking-wider flex items-center gap-1.5 shadow-sm">
              <Cpu className="w-3.5 h-3.5 text-highlight" />
              CLONING: {cloningStatus.toUpperCase()}
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* ERROR HUD OVERLAY ALERT BANNER */}
        {error && (
          <div className="w-full rounded-md border border-rose-500/20 bg-rose-500/10 p-4 flex justify-between items-start gap-3 shadow animate-fade-in z-20">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold font-mono text-rose-500 tracking-wider">
                  TTS BROADCAST FAILURE DIALECT:
                </h4>
                <p className="text-xs text-foreground font-mono leading-relaxed">{error}</p>
              </div>
            </div>
            <button onClick={stop} className="p-1 rounded-md hover:bg-rose-500/10 text-rose-400 hover:text-rose-500 transition-all cursor-pointer outline-none">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ==================== ADMIN PORTAL PANEL (COLLAPSIBLE DECK) ==================== */}
        {showAdminPortal && (
          <Card className="animate-fade-in border-highlight/20 bg-card/85">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-3">
              <CardTitle className="text-highlight">
                <ShieldAlert className="w-4 h-4" />
                Shero-TTS Core Admin Dashboard
              </CardTitle>
              {adminToken && (
                <Button variant="ghost" onClick={handleAdminLogout} className="h-6 text-[8px] font-mono text-rose-400 hover:text-rose-500 flex items-center gap-1">
                  <LogOut className="w-3 h-3" />
                  DISCONNECT SESSION
                </Button>
              )}
            </CardHeader>

            <CardContent className="pt-4">
              {!adminToken ? (
                /* Admin Login Form */
                <form onSubmit={handleAdminLogin} className="max-w-md mx-auto space-y-4">
                  <div className="text-center space-y-1">
                    <p className="text-[10px] text-muted-foreground font-mono">AUTHENTICATE ADMINISTRATIVE ACCESS TO MANAGE SQLite KEYS</p>
                  </div>
                  {adminError && (
                    <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-mono">
                      {adminError}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold tracking-wider block">ADMIN USERNAME:</label>
                      <input 
                        type="text" 
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        placeholder="e.g. admin"
                        required
                        className="w-full shadcn-input py-2 px-3 text-xs outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono font-bold tracking-wider block">ADMIN PASSWORD:</label>
                      <input 
                        type="password" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full shadcn-input py-2 px-3 text-xs outline-none"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={isAdminLoggingIn} className="w-full h-8 text-xs font-mono uppercase tracking-wider">
                    {isAdminLoggingIn ? "Verifying..." : "Validate Credentials"}
                  </Button>
                </form>
              ) : (
                /* Token Management panel */
                <div className="space-y-6">
                  {/* Dynamic API key testing input inside admin card */}
                  <div className="p-4 rounded-md border border-border/60 bg-secondary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h4 className="text-[10px] font-bold font-mono text-foreground flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-highlight" />
                        ACTIVE DASHBOARD API KEY:
                      </h4>
                      <p className="text-[8px] text-muted-foreground font-mono">
                        Current: <span className="text-highlight font-bold select-all">{apiKey}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 max-w-sm w-full">
                      <input 
                        type="password"
                        placeholder="Set custom API key..."
                        value={apiKey}
                        onChange={(e) => saveApiKey(e.target.value)}
                        className="w-full shadcn-input py-1.5 px-3 text-xs outline-none font-mono"
                      />
                      <Button variant="outline" className="h-7 text-[8px] font-mono whitespace-nowrap bg-background" onClick={() => saveApiKey("sh_demo_key_unlimited")}>
                        Reset Demo
                      </Button>
                    </div>
                  </div>

                  {/* Generate Key Row */}
                  <form onSubmit={handleCreateToken} className="flex flex-col sm:flex-row items-end gap-3 max-w-xl border-b border-border/20 pb-5">
                    <div className="flex-1 space-y-1.5 w-full">
                      <label className="text-[9px] font-mono font-bold tracking-wider block text-muted-foreground">GENERATE NEW COGNITIVE KEY:</label>
                      <input 
                        type="text"
                        placeholder="e.g. Dev-Env, Mobile-Client-A"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        required
                        className="w-full shadcn-input py-2 px-3 text-xs outline-none"
                      />
                    </div>
                    <Button type="submit" className="h-8.5 px-6 font-mono text-xs whitespace-nowrap">
                      Generate Key
                    </Button>
                  </form>

                  {/* Highlight newly generated key */}
                  {newlyGeneratedToken && (
                    <div className="p-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 space-y-2 animate-fade-in">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-mono font-bold text-emerald-500 tracking-wider">⚠️ SAVE THIS KEY (ONLY SHOWN ONCE):</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 text-[9px] font-mono text-emerald-600 dark:text-emerald-400"
                          onClick={() => copyToClipboard(newlyGeneratedToken)}
                        >
                          {copiedToken ? <Check className="w-3.5 h-3.5 mr-1" /> : <Clipboard className="w-3.5 h-3.5 mr-1" />}
                          {copiedToken ? "COPIED" : "COPY TO CLIPBOARD"}
                        </Button>
                      </div>
                      <div className="p-2 bg-black/10 rounded font-mono text-xs text-foreground select-all break-all border border-emerald-500/10">
                        {newlyGeneratedToken}
                      </div>
                    </div>
                  )}

                  {/* SQLite Keys List */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-mono font-bold tracking-wider text-muted-foreground uppercase">SQLite API Keys Registry:</h3>
                    
                    {tokensList.length === 0 ? (
                      <p className="text-[10px] font-mono text-muted-foreground italic py-3 text-center border border-dashed border-border/30 rounded">
                        No API Keys registered. Generate a key above to authorize client connections.
                      </p>
                    ) : (
                      <div className="overflow-x-auto border border-border/40 rounded-md">
                        <table className="w-full font-mono text-[9px] text-left border-collapse">
                          <thead>
                            <tr className="bg-secondary/40 border-b border-border/40 text-muted-foreground uppercase font-bold tracking-wider">
                              <th className="py-2.5 px-3">Label / Name</th>
                              <th className="py-2.5 px-3">Token Mask</th>
                              <th className="py-2.5 px-3">Created UTC</th>
                              <th className="py-2.5 px-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tokensList.map((t) => (
                              <tr key={t.id} className="border-b border-border/20 hover:bg-secondary/20 transition-all">
                                <td className="py-2.5 px-3 text-foreground font-bold">{t.name}</td>
                                <td className="py-2.5 px-3 text-muted-foreground">{t.masked_token}</td>
                                <td className="py-2.5 px-3 text-muted-foreground">{t.created_at}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <Button 
                                    variant="ghost" 
                                    className="h-5 px-2 text-[8px] font-mono text-rose-500 hover:text-white hover:bg-rose-500"
                                    onClick={() => handleRevokeToken(t.id)}
                                  >
                                    <Trash className="w-3 h-3 mr-1" />
                                    Revoke
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ERROR HUD AUTH ALERT BANNER */}
        {authError && (
          <div className="w-full rounded-md border border-rose-500/20 bg-rose-500/10 p-4 flex items-center justify-between gap-3 shadow animate-fade-in">
            <div className="flex gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold font-mono text-rose-500 tracking-wider">UNAUTHORIZED API KEY ERROR:</h4>
                <p className="text-xs text-foreground font-mono leading-tight">
                  The active token has been deleted or revoked by the system. Click on the <strong>Admin Portal</strong> to login and generate/reset keys.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DASHBOARD BODY */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
          
          {/* LAYER 2: CONTROLS & SETTINGS (LEFT - 7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6 md:gap-8">
            <TTSControlPanel
              apiBaseUrl={API_BASE_URL}
              isPlaying={isPlaying}
              voices={voices}
              isLoadingVoices={isLoadingVoices}
              onRefreshVoices={fetchVoices}
              onPlay={handlePlay}
              onStop={stop}
            />

            <VoiceCloner
              apiBaseUrl={API_BASE_URL}
              apiKey={apiKey}
              onCloneSuccess={() => {
                fetchVoices();
              }}
            />
          </div>

          {/* LAYER 2: VISUALIZATION & SPEC SHEET (RIGHT - 5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6 md:gap-8">
            
            {/* Visualizer card (Frosted Shadcn Panel) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle>
                  <span className="w-1.5 h-1.5 rounded-full bg-highlight animate-pulse" />
                  Live Waveform Broadcast
                </CardTitle>
                <span className="text-[8px] font-mono text-muted-foreground tracking-widest uppercase opacity-85 select-none">
                  FFT SPECTRUM ANALYZER
                </span>
              </CardHeader>
              <CardContent className="pb-5">
                <div className="visualizer-well p-2">
                  <AudioVisualizer isPlaying={isPlaying} analyser={analyser} />
                </div>
              </CardContent>
            </Card>

            {/* HUD Metadata Readout Card (Frosted Shadcn Panel) */}
            <Card className="relative group overflow-hidden">
              <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t border-r border-border pointer-events-none" />
              <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b border-l border-border pointer-events-none" />

              <CardHeader>
                <CardTitle>
                  <Settings className="w-4 h-4 text-highlight" />
                  System Diagnostic Telemetry
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3.5 font-mono text-[10px] text-muted-foreground">
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span>ACTIVE COGNITIVE MODEL:</span>
                    <span className="text-foreground text-right font-semibold truncate max-w-[200px]" title={serverStats.modelName}>
                      {serverStats.modelName}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span>SPEAKER PROMPT CATALOG:</span>
                    <span className="text-foreground font-bold">{voices.length} INDICES</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span>CACHED EMBEDDINGS:</span>
                    <span className="text-foreground font-bold">{serverStats.cachedStates} BUFFERS</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span>DECODER ALGORITHM:</span>
                    <span className="text-foreground flex items-center gap-1 font-bold">
                      <Disc className="w-3.5 h-3.5 text-highlight-sec animate-spin-slow" />
                      LAME MP3 (24kHz Mono)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

        </div>

        {/* FOOTER */}
        <footer className="mt-auto border-t border-border pt-6 flex flex-col md:flex-row justify-between items-center text-[9px] font-mono text-muted-foreground gap-2 select-none opacity-75">
          <span>SHERO-TTS CONTROL CENTER // v1.0.0</span>
          <span>COPYRIGHT PUBLIC DOMAIN (CC0 LICENSE)</span>
        </footer>
      </main>
    </div>
  );
}
