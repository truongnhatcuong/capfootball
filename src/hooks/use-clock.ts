"use client";
import { useSyncExternalStore } from "react";
function subscribe(callback: () => void) { const id = setInterval(callback, 1000); return () => clearInterval(id); }
function snapshot() { return Math.floor(Date.now() / 30000) * 30000; }
function serverSnapshot() { return 0; }
export function useClock() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }
