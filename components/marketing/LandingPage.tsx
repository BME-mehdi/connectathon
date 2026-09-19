"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { HeartPulse, ClipboardCheck, ShieldAlert, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const SLIDES = [
  {
    icon: HeartPulse,
    title: "Pensé pour le foyer",
    body: "Chaque adulte consentant du foyer complète son propre dépistage, en confirmant lui-même son compte. Un enfant mineur peut être ajouté par son tuteur légal — sans qu'aucune donnée de santé personnelle ne soit jamais collectée à son sujet.",
  },
  {
    icon: ClipboardCheck,
    title: "Un questionnaire court et validé",
    body: "Âge, tour de taille, antécédents familiaux : le questionnaire DIABSCORE se complète en quelques minutes. Une extension FINDRISC-lite, entièrement optionnelle, permet d'affiner le score pour qui le souhaite.",
  },
  {
    icon: ShieldAlert,
    title: "Un résultat clair, jamais un diagnostic",
    body: "Le résultat indique un niveau de risque — faible, modéré ou élevé — jamais un diagnostic médical. En cas de risque élevé, une orientation vers un laboratoire médical partenaire est proposée automatiquement pour un test de confirmation.",
  },
  {
    icon: Lock,
    title: "Vos données restent dans votre foyer",
    body: "L'accès aux données individuelles est strictement limité au foyer concerné. Les partenaires de santé n'ont jamais accès à un résultat individuel — uniquement à des statistiques agrégées et anonymisées.",
  },
];

function AnimatedSlides() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const slide = SLIDES[index];
  const Icon = slide.icon;

  function go(delta: number) {
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  }

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="relative min-h-72 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 py-12 text-center sm:px-14"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-hero-gradient text-white shadow-glow">
              <Icon className="size-7" strokeWidth={2} />
            </span>
            <h3 className="text-2xl">{slide.title}</h3>
            <p className="max-w-xl text-muted-foreground leading-relaxed">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          onClick={() => go(-1)}
          aria-label="Diapositive précédente"
          className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setIndex(i)}
              aria-label={`Aller à la diapositive ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-accent" : "w-1.5 bg-border hover:bg-secondary"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => go(1)}
          aria-label="Diapositive suivante"
          className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-hero-wash">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
          <p className="label-caps text-accent-foreground mb-4">Dépistage familial du diabète de type 2</p>
          <h1 className="text-4xl sm:text-5xl leading-tight">
            Le dépistage du diabète de type 2,<br className="hidden sm:block" /> pensé pour toute la famille.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-muted-foreground text-lg leading-relaxed">
            WiqayaT2D accompagne chaque foyer dans le dépistage précoce du risque de diabète de type 2 —
            un questionnaire court et validé, un résultat clair, et une orientation automatique vers un
            laboratoire médical partenaire en cas de risque élevé.
          </p>
          <div className="mt-9 flex items-center justify-center">
            <Button size="lg" className="px-8 text-base" nativeButton={false} render={<Link href="/auth/login">Commencer →</Link>} />
          </div>
        </div>
      </section>

      {/* Animated slides */}
      <section className="px-4 py-16 sm:py-20">
        <AnimatedSlides />
      </section>

      {/* Closing CTA */}
      <section className="bg-hero-gradient">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-white">
          <h2 className="text-3xl text-white">Prêt à évaluer le risque de votre foyer ?</h2>
          <p className="mt-3 text-white/85 leading-relaxed">
            Créez votre foyer et commencez le dépistage en quelques minutes.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              variant="secondary"
              className="px-8 text-base"
              nativeButton={false}
              render={<Link href="/auth/login">Commencer →</Link>}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-10 text-center">
          <Image src="/logo.jpeg" alt="WiqayaT2D" width={112} height={61} className="h-8 w-auto object-contain" />
          <p className="text-xs text-muted-foreground">Dépistage et protection complets contre le diabète</p>
          <p className="text-xs text-muted-foreground/70">© {new Date().getFullYear()} WiqayaT2D</p>
        </div>
      </footer>
    </div>
  );
}
