import { useEffect, useState, useCallback, useRef } from "react";

export interface GeoCoords {
  latitude: number;
  longitude: number;
  /** 精度半径 (m) */
  accuracy: number;
  /** ISO 时间戳 */
  timestamp: number;
}

export type GeoStatus =
  /** 还没开始 / 等待用户授权 */
  | "idle"
  /** 正在请求位置 */
  | "pending"
  /** 拿到位置了 */
  | "resolved"
  /** 用户拒绝授权 (PERMISSION_DENIED) */
  | "denied"
  /** 设备不支持 / 内部错误 / 超时 */
  | "unavailable";

interface CachedGeo {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

const STORAGE_KEY = "studio-arona:geo-cache";
/**
 * 缓存有效期 10min. 短一点避免"上次在沈阳授权过"这种缓存盖住"现在已经到吉林".
 * 桌面前长时间停留不会重复弹, 但用户移动后下次进入能拿到新位置.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * devbypass 模式 (?devbypass=1) 下, 浏览器拿不到真实定位 (Puppeteer / 离线浏览).
 * 给一个沈阳的 mock 坐标让天气瓦片能正常显示 — 跟 MSW mock schedules/feeds 一样,
 * 仅 devbypass 生效.
 */
function readDevBypassMock(): GeoCoords | null {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("devbypass") !== "1") return null;
    return {
      latitude: 41.8057,
      longitude: 123.4315,
      accuracy: 50,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

function readCache(): GeoCoords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGeo;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return {
      latitude: parsed.lat,
      longitude: parsed.lon,
      accuracy: parsed.accuracy,
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

function writeCache(coords: GeoCoords): void {
  try {
    const payload: CachedGeo = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy,
      timestamp: coords.timestamp,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage 满了 / 隐私模式 — 不重要, 下次重新请求即可
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 隐私模式等 — 不重要
  }
}

function getPosition(timeoutMs = 8000): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation API not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        // err.code: 1 PERMISSION_DENIED / 2 POSITION_UNAVAILABLE / 3 TIMEOUT
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("PERMISSION_DENIED"));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("TIMEOUT"));
        } else {
          reject(new Error("POSITION_UNAVAILABLE"));
        }
      },
      {
        enableHighAccuracy: false,
        // 30s: 已授权用户不重复弹窗, 但 30s 后强制重读一次硬件位置
        maximumAge: 30 * 1000,
        timeout: timeoutMs,
      },
    );
  });
}

/**
 * 浏览器地理位置 hook.
 *
 * 行为:
 * - mount 时主动申请一次定位 (getCurrentPosition). 未授权就弹授权框, 已授权静默获取.
 *   这是用户期望的"进首页就申请一次位置"语义.
 * - localStorage 10min 内有缓存 → 立刻 setCoords 触发渲染, 同时后台重发
 *   getCurrentPosition 拉新数据 (已授权用户浏览器不重复弹窗, 但移动后能更新).
 * - 拒绝 / 不可用 → status 停留在 denied / unavailable, coords 保持 null.
 *   ⚠️ 不再有 defaultCity 假数据兜底. coords 是 null 就 null, 业务自己显示"未授权".
 * - refresh() → 清缓存 + 重新跑 getCurrentPosition. 业务上让用户在瓦片上点一下
 *   就能强制重新申请 (e.g. 用户怀疑浏览器给了错的坐标, 想再问一次).
 */
export function useGeolocation(): {
  coords: GeoCoords | null;
  status: GeoStatus;
  /** 强制重新申请定位 (清缓存 + 重发 getCurrentPosition) */
  refresh: () => void;
  /** 是否正在请求中 (首次挂载 / refresh 触发后) */
  isFetching: boolean;
} {
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [refreshTick, setRefreshTick] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  // 避免 React 18 StrictMode 下 effect 双调用导致两个并发请求互相覆盖
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    // devbypass 模式: 走 mock 坐标, 不发真实定位
    const devMock = readDevBypassMock();
    if (devMock) {
      setCoords(devMock);
      setStatus("resolved");
      setIsFetching(false);
      console.warn(
        `[geo] devbypass mock: lat=${devMock.latitude} lon=${devMock.longitude}`,
      );
      return;
    }

    // 真实定位: 拿到后立即 setCoords 触发渲染 (即使是缓存), 同时后台发新请求
    setIsFetching(true);
    const cached = readCache();
    if (cached) {
      setCoords(cached);
      setStatus("resolved");
    } else {
      setStatus("pending");
    }

    // 已经有一个 in-flight 请求 (StrictMode 双调用 / 用户连续点 refresh) → 复用
    if (inflight.current) return;

    const p = getPosition()
      .then((c) => {
        writeCache(c);
        setCoords(c);
        setStatus("resolved");
        console.warn(
          `[geo] resolved: lat=${c.latitude.toFixed(4)} lon=${c.longitude.toFixed(4)} accuracy=${c.accuracy.toFixed(0)}m`,
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "PERMISSION_DENIED") setStatus("denied");
        else setStatus("unavailable");
        console.warn(`[geo] failed: ${msg}`);
      })
      .finally(() => {
        inflight.current = null;
        setIsFetching(false);
      });
    inflight.current = p;
  }, [refreshTick]);

  const refresh = useCallback(() => {
    clearCache();
    setStatus("pending");
    setIsFetching(true);
    setRefreshTick((t) => t + 1);
  }, []);

  return { coords, status, refresh, isFetching };
}
