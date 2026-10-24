"use client";
import { create } from "zustand";

export type Toast = { id: number; type: "success" | "error" | "info"; message: string; duration: number };
let nextId = 0;

export const useToastStore = create<{ items: Toast[]; dismiss: (id?: number) => void }>((set) => ({
  items: [],
  dismiss: (id) => set((state) => ({ items: id === undefined ? [] : state.items.filter((item) => item.id !== id) })),
}));

function show(type: Toast["type"], message: string) {
  const item: Toast = { id: ++nextId, type, message, duration: type === "error" ? 6500 : 4500 };
  useToastStore.setState((state) => ({
    items: [...state.items.filter((previous) => previous.message !== message), item].slice(-3),
  }));
  return item.id;
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  info: (message: string) => show("info", message),
  dismiss: (id?: number) => useToastStore.getState().dismiss(id),
};
