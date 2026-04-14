"use client";

import { useEffect, useState, useRef } from "react";

interface TypewriterTextProps {
  text: string;
  speed?: number; // ms per character
}

export default function TypewriterText({ text, speed = 15 }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const prevTextRef = useRef("");

  useEffect(() => {
    // Reset if text changes
    if (text !== prevTextRef.current) {
      prevTextRef.current = text;
      indexRef.current = 0;
      setDisplayed("");
      setDone(false);
    }

    if (!text) return;

    const timer = setInterval(() => {
      if (indexRef.current < text.length) {
        // Type 2-3 chars at a time for speed
        const chunk = text.slice(indexRef.current, indexRef.current + 3);
        indexRef.current += chunk.length;
        setDisplayed(text.slice(0, indexRef.current));
      } else {
        setDone(true);
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-3.5 bg-emerald-400 ml-0.5 animate-pulse align-middle" />}
    </span>
  );
}
