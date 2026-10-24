"use client";
import { toast } from "@/stores/toast.store";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  MapPin, Search, Check, ChevronDown, ArrowUpRight, ChevronRight, SearchX, X,
} from "lucide-react";
import { useRegionStore } from "@/stores/region.store";
import { api, json } from "@/lib/client";
import type { Province, Profile } from "@/types";
import { Modal, ErrorState, Loading } from "./ui";
import styles from "./province-picker.module.css";

const subscribeHydration = (listener: () => void) =>
  useRegionStore.persist?.onFinishHydration(listener) ?? (() => {});
const hasHydrated = () => useRegionStore.persist?.hasHydrated() ?? false;
const shortName = (name: string) => name.replace(/^(Thành phố|Tỉnh) /, "");
const normalizeSearch = (value: string) => value
  .toLocaleLowerCase("vi")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .trim();
export function ProvincePicker() {
  const { provinceCode, provinceName, setProvince } = useRegionStore();
  const { data: session } = useSession();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    hasHydrated,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const provinces = useQuery({
    queryKey: ["provinces"],
    queryFn: () => api<{ data: Province[] }>("/api/provinces"),
    staleTime: 86400000,
  });
  useEffect(() => {
    void useRegionStore.persist?.rehydrate();
    const urlCode = new URLSearchParams(window.location.search).get("province");
    if (urlCode && provinces.data?.data) {
      const p = provinces.data.data.find((p) => p.code === urlCode);
      if (p) setProvince(p.code, p.name);
    }
  }, [provinces.data, setProvince, pathname]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    void api<Profile>("/api/me")
      .then((me) => {
        if (
          !active ||
          useRegionStore.getState().provinceCode ||
          !me.provinceCode
        )
          return;
        const p = provinces.data?.data.find((p) => p.code === me.provinceCode);
        if (p) {
          setProvince(p.code, p.name);
          setOpen(false);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user, provinces.data, setProvince]);
  const searchTerm = normalizeSearch(search);
  const filtered = provinces.data?.data.filter((p) => normalizeSearch(p.name).includes(searchTerm)) ?? [];
  const quickProvinces = ["01", "79", "48", "92"].flatMap(
    (code) => provinces.data?.data.find((p) => p.code === code) ?? [],
  );
  function close() {
    setOpen(false);
    setDismissed(true);
    setSearch("");
  }
  async function select(p: Province) {
    setProvince(p.code, p.name);
    close();
    const url = new URL(window.location.href);
    if (url.searchParams.has("province")) {
      url.searchParams.set("province", p.code);
      window.history.replaceState(null, "", url);
    }
    if (session?.user)
      try {
        await api("/api/me", json("PATCH", { provinceCode: p.code }));
      } catch {
        toast.info("Đã lưu khu vực trên máy. Chưa đồng bộ được hồ sơ.");
      }
  }
  return (
    <>
      <button type="button" className="region-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <MapPin size={17} />
        <span>
          {provinceName?.replace(/^(Thành phố|Tỉnh) /, "") ?? "Chọn khu vực"}
        </span>
        <span className="chevron">
          <ChevronDown />
        </span>
      </button>
      <Modal
        open={
          open || (pathname === "/" && hydrated && !provinceCode && !dismissed)
        }
        onClose={close}
        title="Bạn muốn ra sân ở đâu?"
        className={styles.modal}
      >
        <div className={styles.intro}>
          <span className={styles.introIcon} aria-hidden="true"><MapPin size={21} /></span>
          <p>Chọn khu vực của bạn.<br />Những kèo bóng gần nhà đang chờ!</p>
          <span className={styles.pitch} aria-hidden="true"><span /></span>
        </div>
        <div className={styles.body}>
        <div className={styles.search}>
          <Search size={19} aria-hidden="true" />
          <input
            aria-label="Tìm tỉnh thành"
            placeholder="Tìm tỉnh / thành phố..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && <button type="button" className={styles.clearSearch} aria-label="Xóa tìm kiếm" onClick={() => setSearch("")}><X size={16} /></button>}
        </div>
        {provinces.isPending ? (
          <Loading />
        ) : provinces.error ? (
          <ErrorState
            error={provinces.error}
            retry={() => void provinces.refetch()}
          />
        ) : (
          <>
            {!search.trim() && quickProvinces.length > 0 && <div className={styles.quickSection}>
              <span className={styles.sectionLabel}>Chọn nhanh</span>
              <div className={styles.quickList}>{quickProvinces.map((p) => <button type="button" key={p.code} aria-label={`Chọn nhanh ${shortName(p.name)}`} aria-pressed={p.code === provinceCode} onClick={() => void select(p)}>{shortName(p.name)}<ArrowUpRight size={13} aria-hidden="true" /></button>)}</div>
            </div>}
            <div className={styles.listHeading}>
              <span className={styles.sectionLabel}>{search.trim() ? "Kết quả tìm kiếm" : "Tất cả tỉnh / thành phố"}</span>
              <span className={styles.resultCount} role="status" aria-live="polite">{filtered.length} khu vực</span>
            </div>
          <div className={styles.provinceList}>
            {filtered.map((p) => (
                <button
                  type="button"
                  key={p.code}
                  onClick={() => void select(p)}
                  className={`${styles.option} ${p.code === provinceCode ? styles.selected : ""}`}
                  aria-label={p.name}
                  aria-pressed={p.code === provinceCode}
                >
                  <span className={styles.optionIcon} aria-hidden="true"><MapPin size={17} /></span>
                  <span className={styles.optionText}><strong>{shortName(p.name)}</strong><small>{p.name.startsWith("Thành phố") ? "Thành phố" : "Tỉnh"}</small></span>
                  {p.code === provinceCode ? <span className={styles.check} aria-hidden="true"><Check size={13} strokeWidth={3} /></span> : <ChevronRight size={15} className={styles.optionArrow} aria-hidden="true" />}
                </button>
              ))}
              {!filtered.length && <div className={styles.empty}><SearchX size={30} aria-hidden="true" /><strong>Chưa tìm thấy khu vực</strong><p>Thử tên tỉnh / thành phố khác nhé.</p><button type="button" onClick={() => setSearch("")}>Xem tất cả khu vực</button></div>}
          </div>
          </>
        )}
        </div>
        <div className={styles.footer}><MapPin size={14} aria-hidden="true" /><span>Bạn có thể đổi khu vực bất cứ lúc nào.</span></div>
      </Modal>
    </>
  );
}
