import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  HardHat,
  Camera, 
  PenTool, 
  FileText, 
  Mail, 
  Shield,
  CheckCircle,
  ArrowRight,
  ClipboardList,
  Pause,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const CARD_STATES = [
  {
    dotColor: "#94a3b8",
    badgeBg: "hsla(215,25%,30%,0.40)",
    badgeBorder: "hsla(215,25%,50%,0.30)",
    project: "Downtown Tower",
    weather: "—",
    workText: "Starting today's inspection...",
    photos: 0,
    extraCount: 0,
    statusText: "Draft",
    statusTextColor: "#94a3b8",
  },
  {
    dotColor: "#facc15",
    badgeBg: "hsla(45,90%,50%,0.15)",
    badgeBorder: "hsla(45,90%,50%,0.30)",
    project: "Downtown Tower",
    weather: "Clear, 72°F",
    workText: "Completed foundation inspection for Section A, reviewing rebar placements...",
    photos: 2,
    extraCount: 0,
    statusText: "In Progress",
    statusTextColor: "#facc15",
  },
  {
    dotColor: "#4ade80",
    badgeBg: "hsla(145,52%,36%,0.20)",
    badgeBorder: "hsla(145,52%,36%,0.30)",
    project: "Downtown Tower",
    weather: "Clear, 72°F",
    workText: "Completed foundation inspection for Section A and reviewed rebar placements with structural engineer on-site.",
    photos: 2,
    extraCount: 4,
    statusText: "Submitted",
    statusTextColor: "#4ade80",
  },
];

export default function LandingPage() {
  const [cardStateIndex, setCardStateIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [entered, setEntered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lockedPause, setLockedPause] = useState(false);
  const innerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const lockedPauseRef = useRef(false);
  const hoveredRef = useRef(false);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const featuresRef = useRef<HTMLDivElement>(null);
  const [featuresVisible, setFeaturesVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) { setEntered(true); setFeaturesVisible(true); return; }
    const enterTimer = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(enterTimer);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const el = featuresRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setFeaturesVisible(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const cycle = setInterval(() => {
      if (pausedRef.current) return;
      setVisible(false);
      innerTimerRef.current = setTimeout(() => {
        setCardStateIndex((i) => (i + 1) % CARD_STATES.length);
        setVisible(true);
      }, 400);
    }, 3200);
    return () => {
      clearInterval(cycle);
      if (innerTimerRef.current) clearTimeout(innerTimerRef.current);
    };
  }, [reducedMotion]);

  const state = CARD_STATES[cardStateIndex];

  const transitioningRef = useRef(false);

  const navigateState = (dir: 1 | -1, e: React.MouseEvent) => {
    e.stopPropagation();
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    lockedPauseRef.current = true;
    setLockedPause(true);
    pausedRef.current = true;
    setPaused(true);
    if (innerTimerRef.current) {
      clearTimeout(innerTimerRef.current);
      innerTimerRef.current = null;
    }
    setVisible(false);
    innerTimerRef.current = setTimeout(() => {
      setCardStateIndex((i) => (i + dir + CARD_STATES.length) % CARD_STATES.length);
      setVisible(true);
      transitioningRef.current = false;
    }, 350);
  };

  const features = [
    {
      icon: <Camera className="w-6 h-6" />,
      title: "Photo Documentation",
      description: "Capture and organize site photos with captions directly from your mobile device",
    },
    {
      icon: <PenTool className="w-6 h-6" />,
      title: "Digital Signatures",
      description: "Sign reports with finger or stylus for authenticated submissions",
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Professional PDFs",
      description: "Generate branded US Letter PDFs with company logo and all report details",
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Easy Distribution",
      description: "Email reports to project stakeholders with one tap",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Secure & Reliable",
      description: "All data stored securely with automatic backups",
    },
    {
      icon: <HardHat className="w-6 h-6" />,
      title: "Built for the Field",
      description: "Mobile-first design optimized for construction site conditions",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-card-enter {
          animation: fadeUp 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .hero-text-enter {
          animation: fadeUp 0.60s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .feature-card-hidden {
          opacity: 0;
          transform: translateY(24px);
        }
        .feature-card-enter {
          animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-card-enter { animation: none; opacity: 1; }
          .hero-text-enter { animation: none; opacity: 1; }
          .feature-card-hidden { opacity: 1; transform: none; }
          .feature-card-enter { animation: none; opacity: 1; }
        }
      `}</style>

      <header className="sticky top-0 z-50 w-full bg-[hsl(216,32%,15%)] text-white border-b border-white/10 backdrop-blur-sm">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[hsl(36,90%,50%)] flex items-center justify-center shadow-sm">
              <HardHat className="w-5 h-5 text-[hsl(216,32%,10%)]" />
            </div>
            <span className="font-bold text-base tracking-tight">Field Daily Reports</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm" data-testid="button-header-login">
              <a href="/api/login">Sign In</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-24 md:py-36">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,72%,20%)] via-[hsl(216,32%,15%)] to-[hsl(216,40%,10%)]" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 60% -10%, hsla(38,92%,50%,0.18), transparent)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

          <div className="container relative px-4 md:px-6 mx-auto max-w-screen-xl">
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-16 items-center">
              <div className="space-y-8">
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold border w-fit ${entered ? "hero-text-enter" : "opacity-0"}`}
                  style={{ background: "hsla(38,92%,50%,0.15)", color: "hsl(38,92%,65%)", borderColor: "hsla(38,92%,50%,0.25)", animationDelay: "0ms" }}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Built for construction inspectors
                </div>

                <div className="space-y-5">
                  <h1
                    className={`text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-none text-white ${entered ? "hero-text-enter" : "opacity-0"}`}
                    style={{ animationDelay: "80ms" }}
                  >
                    Daily Reports
                    <span className="block text-[hsl(38,92%,50%)]">Made Simple</span>
                  </h1>
                  <p
                    className={`text-lg text-[hsl(210,25%,75%)] max-w-md leading-relaxed ${entered ? "hero-text-enter" : "opacity-0"}`}
                    style={{ animationDelay: "160ms" }}
                  >
                    The mobile-first solution for construction inspectors — create professional 
                    daily reports with photos, signatures, and instant PDF generation.
                  </p>
                </div>

                <div
                  className={`flex flex-col sm:flex-row gap-3 ${entered ? "hero-text-enter" : "opacity-0"}`}
                  style={{ animationDelay: "240ms" }}
                >
                  <Button
                    size="lg"
                    asChild
                    className="h-12 px-6 bg-[hsl(38,92%,50%)] hover:bg-[hsl(38,92%,45%)] text-[hsl(216,32%,10%)] font-bold shadow-lg hover:shadow-xl transition-all"
                    data-testid="button-hero-get-started"
                  >
                    <a href="/api/login">
                      Get Started Free
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    asChild
                    className="h-12 px-6 text-white hover:text-white"
                    style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.2)" }}
                    data-testid="button-hero-learn-more"
                  >
                    <a href="/learn-more">See How It Works</a>
                  </Button>
                </div>

                <div
                  className={`flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-[hsl(210,25%,65%)] ${entered ? "hero-text-enter" : "opacity-0"}`}
                  style={{ animationDelay: "320ms" }}
                >
                  {["No credit card required", "Mobile optimized", "Works offline"].map((label) => (
                    <div key={label} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative hidden lg:flex items-center justify-center">
                <div className="absolute inset-0 rounded-3xl blur-3xl" style={{ background: "radial-gradient(ellipse at center, hsla(38,92%,50%,0.10), hsla(220,72%,60%,0.10))" }} />

                <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                <div
                  className={`relative w-full rounded-2xl p-6 hover:-translate-y-0.5 transition-transform duration-300 ${entered ? "hero-card-enter" : "opacity-0"}`}
                  data-testid="hero-preview-card"
                  tabIndex={0}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(12px)",
                    border: paused ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.12)",
                    boxShadow: paused
                      ? "0 24px 48px -8px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.18)"
                      : "0 24px 48px -8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
                    transition: "border 0.2s ease, box-shadow 0.2s ease",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    const next = !lockedPauseRef.current;
                    lockedPauseRef.current = next;
                    setLockedPause(next);
                    const shouldPause = next || hoveredRef.current;
                    pausedRef.current = shouldPause;
                    setPaused(shouldPause);
                    if (next) {
                      if (innerTimerRef.current) {
                        clearTimeout(innerTimerRef.current);
                        innerTimerRef.current = null;
                        setVisible(true);
                      }
                    }
                  }}
                  onMouseEnter={() => {
                    hoveredRef.current = true;
                    pausedRef.current = true;
                    setPaused(true);
                    if (innerTimerRef.current) {
                      clearTimeout(innerTimerRef.current);
                      innerTimerRef.current = null;
                      setVisible(true);
                    }
                  }}
                  onMouseLeave={() => {
                    hoveredRef.current = false;
                    if (!lockedPauseRef.current) {
                      pausedRef.current = false;
                      setPaused(false);
                    }
                  }}
                  onFocus={() => { pausedRef.current = true; setPaused(true); }}
                  onBlur={() => {
                    if (!lockedPauseRef.current && !hoveredRef.current) {
                      pausedRef.current = false;
                      setPaused(false);
                    }
                  }}
                >
                  <div
                    data-testid="pause-indicator"
                    style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 8px",
                      borderRadius: "9999px",
                      background: lockedPause ? "rgba(250,204,21,0.18)" : "rgba(255,255,255,0.12)",
                      border: lockedPause ? "1px solid rgba(250,204,21,0.40)" : "1px solid rgba(255,255,255,0.22)",
                      backdropFilter: "blur(8px)",
                      opacity: paused ? 1 : 0,
                      visibility: paused ? "visible" : "hidden",
                      transform: paused ? "scale(1)" : "scale(0.85)",
                      transition: "opacity 0.2s ease, transform 0.2s ease, background 0.2s ease, border 0.2s ease",
                      pointerEvents: "none",
                    }}
                  >
                    {lockedPause
                      ? <Lock className="w-3 h-3" style={{ color: "rgba(250,204,21,0.85)" }} />
                      : <Pause className="w-3 h-3" style={{ color: "rgba(255,255,255,0.70)" }} />
                    }
                    <span style={{
                      fontSize: "11px",
                      color: lockedPause ? "rgba(250,204,21,0.80)" : "rgba(255,255,255,0.60)",
                      fontWeight: 500,
                      letterSpacing: "0.02em",
                    }}>
                      {lockedPause ? "Locked" : "Paused"}
                    </span>
                  </div>
                  <div
                    className="space-y-4"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: visible ? "translateY(0)" : "translateY(6px)",
                      transition: "opacity 0.35s ease, transform 0.35s ease",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: "hsla(38,92%,50%,0.20)", border: "1px solid hsla(38,92%,50%,0.30)" }}
                      >
                        <FileText className="w-5 h-5 text-[hsl(38,92%,60%)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-white">Daily Inspection Report</p>
                        <p className="text-sm" style={{ color: "rgba(255,255,255,0.50)" }}>Project: {state.project}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                        <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "rgba(255,255,255,0.40)" }}>Date</p>
                        <p className="font-semibold text-white text-sm">Apr 21, 2026</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                        <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "rgba(255,255,255,0.40)" }}>Weather</p>
                        <p className="font-semibold text-white text-sm">{state.weather || <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}</p>
                      </div>
                    </div>

                    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                      <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "rgba(255,255,255,0.40)" }}>Work Performed</p>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.70)" }}>{state.workText}</p>
                    </div>

                    <div className="flex gap-2.5 items-center">
                      {state.photos >= 1 && (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                          <Camera className="w-5 h-5" style={{ color: "rgba(255,255,255,0.30)" }} />
                        </div>
                      )}
                      {state.photos >= 2 && (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                          <Camera className="w-5 h-5" style={{ color: "rgba(255,255,255,0.30)" }} />
                        </div>
                      )}
                      {state.photos === 0 && (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }}>
                          <Camera className="w-5 h-5" style={{ color: "rgba(255,255,255,0.18)" }} />
                        </div>
                      )}
                      {state.extraCount > 0 && (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: "hsla(38,92%,50%,0.15)", border: "1px solid hsla(38,92%,50%,0.25)" }}>
                          <span className="text-xs font-bold text-[hsl(38,92%,60%)]">+{state.extraCount}</span>
                        </div>
                      )}
                      <div className="ml-auto">
                        <div
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                          style={{ background: state.badgeBg, border: `1px solid ${state.badgeBorder}` }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: state.dotColor }} />
                          <span className="text-xs font-semibold" style={{ color: state.statusTextColor }}>{state.statusText}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                  <div className="flex justify-center items-center gap-3 w-full px-1">
                      <button
                        data-testid="button-card-prev"
                        aria-label="Previous state"
                        onClick={(e) => navigateState(-1, e)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "24px",
                          height: "24px",
                          borderRadius: "9999px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.16)",
                          color: "rgba(255,255,255,0.55)",
                          cursor: "pointer",
                          transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.16)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.90)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.30)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.16)";
                        }}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5">
                        {CARD_STATES.map((_, i) => (
                          <div
                            key={i}
                            className="rounded-full transition-all duration-300"
                            style={{
                              width: i === cardStateIndex ? "16px" : "6px",
                              height: "6px",
                              background: i === cardStateIndex ? "hsla(38,92%,50%,0.90)" : "rgba(255,255,255,0.20)",
                            }}
                          />
                        ))}
                      </div>

                      <button
                        data-testid="button-card-next"
                        aria-label="Next state"
                        onClick={(e) => navigateState(1, e)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "24px",
                          height: "24px",
                          borderRadius: "9999px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.16)",
                          color: "rgba(255,255,255,0.55)",
                          cursor: "pointer",
                          transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.16)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.90)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.30)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.16)";
                        }}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="container px-4 md:px-6 mx-auto max-w-screen-xl">
            <div className="text-center space-y-3 mb-14">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-2">
                Features
              </div>
              <h2 className="text-4xl font-extrabold tracking-tight">Everything You Need</h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-base leading-relaxed">
                Powerful features designed specifically for construction field inspectors — from first visit to final sign-off.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" ref={featuresRef}>
              {features.map((feature, index) => (
                <Card
                  key={index}
                  className={`hover-elevate transition-all hover:shadow-lg border-border/60 bg-card group ${featuresVisible ? "feature-card-enter" : "feature-card-hidden"}`}
                  data-testid={`card-feature-${index}`}
                  style={{
                    boxShadow: "var(--shadow-sm)",
                    animationDelay: featuresVisible ? `${index * 80}ms` : undefined,
                  }}
                >
                  <CardContent className="p-6 space-y-4">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/15 transition-colors">
                      {feature.icon}
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-semibold text-base leading-tight">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-6 px-4 md:px-6 pb-24">
          <div className="container mx-auto max-w-screen-xl">
            <div
              className="relative overflow-hidden rounded-3xl px-8 py-16 md:py-20 text-center"
              style={{ boxShadow: "var(--shadow-xl)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,72%,20%)] via-[hsl(216,32%,15%)] to-[hsl(216,40%,10%)]" />
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% -10%, hsla(38,92%,50%,0.18), transparent)" }} />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px" style={{ background: "linear-gradient(to right, transparent, hsla(38,92%,50%,0.40), transparent)" }} />

              <div className="relative space-y-6 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold border"
                  style={{ background: "hsla(38,92%,50%,0.15)", color: "hsl(38,92%,65%)", borderColor: "hsla(38,92%,50%,0.25)" }}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Free to get started
                </div>
                <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                  Ready to Streamline<br />Your Reporting?
                </h2>
                <p className="text-base md:text-lg max-w-lg mx-auto leading-relaxed" style={{ color: "hsl(210,25%,70%)" }}>
                  Join construction teams who trust Field Daily Reports for their inspection documentation — no paperwork, no delays.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button
                    size="lg"
                    asChild
                    className="h-12 px-8 bg-[hsl(38,92%,50%)] hover:bg-[hsl(38,92%,45%)] text-[hsl(216,32%,10%)] font-bold shadow-lg hover:shadow-xl transition-all"
                    data-testid="button-cta-get-started"
                  >
                    <a href="/api/login">
                      Start Creating Reports
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 bg-muted/20">
        <div className="container px-4 md:px-6 mx-auto max-w-screen-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <HardHat className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                © 2026 Field Daily Reports
              </span>
            </div>
            <div className="flex gap-5 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
