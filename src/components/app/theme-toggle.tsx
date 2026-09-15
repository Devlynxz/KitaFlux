"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEY = "kitaflux-theme";
const EVENT = "kitaflux:theme";

/**
 * Theme toggle.
 *
 * The `dark` class is applied by an inline script in the root layout before
 * first paint; this component only reflects and flips it. The class on <html>
 * is therefore the source of truth, not React state -- so it is read through
 * `useSyncExternalStore` rather than mirrored into state by an effect, which
 * would re-render a second time on every mount.
 */

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // Another tab changing the theme should update this one too.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

// The server cannot know the visitor's theme. Rendering light and letting the
// pre-paint script correct it is why the button renders a fixed-size
// placeholder until it is mounted.
function getServerSnapshot() {
  return null;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore<boolean | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // Private mode or blocked storage: the toggle still works for this visit.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  // Reserves the button's footprint so the header does not shift on hydration.
  if (dark === null) return <div className="size-9" aria-hidden />;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
