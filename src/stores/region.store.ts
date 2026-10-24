"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
type State = { provinceCode: string | null; provinceName: string | null; setProvince: (code: string, name: string) => void; clear: () => void };
export const useRegionStore = create<State>()(persist((set) => ({ provinceCode: null, provinceName: null, setProvince: (provinceCode, provinceName) => { set({ provinceCode, provinceName }); document.cookie = `province=${provinceCode};path=/;max-age=31536000;SameSite=Lax`; }, clear: () => { set({ provinceCode: null, provinceName: null }); document.cookie = "province=;path=/;max-age=0;SameSite=Lax"; } }), { name: "capfootball-region", version: 1, skipHydration: true }));
