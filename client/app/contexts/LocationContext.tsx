// client/app/contexts/LocationContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

interface Coords {
  lat: number;
  lng: number;
}

interface LocationContextType {
  coords: Coords | null;
  loading: boolean;
  error: string | null;
  permissionStatus: PermissionState | "unknown";
  requestLocation: () => Promise<Coords | null>;
}

const LocationContext = createContext<LocationContextType | undefined>(
  undefined,
);

const STORAGE_KEY = "mw_user_coords";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分鐘有效

function getValidCachedCoords(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      // 支援有時間戳與無時間戳格式（30 分鐘內有效）
      if (!parsed.timestamp || Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch {}
  return null;
}

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [coords, setCoords] = useState<Coords | null>(() =>
    getValidCachedCoords(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    PermissionState | "unknown"
  >("unknown");

  const requestLocation = useCallback((): Promise<Coords | null> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        setError("Geolocation is not supported");
        resolve(null);
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCoords(newCoords);
          setLoading(false);
          try {
            sessionStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ ...newCoords, timestamp: Date.now() }),
            );
          } catch {}
          resolve(newCoords);
        },
        (err) => {
          console.warn("Geolocation request failed/denied:", err.message);
          setError(err.message);
          setLoading(false);
          resolve(null);
        },
        {
          enableHighAccuracy: true, // 在 macOS / 電腦上必須設為 true，macOS 才會主動掃描周遭 Wi-Fi 基地台進行定位 (Google Maps 也是採用此設定)
          timeout: 10000,
          maximumAge: 10 * 60 * 1000, // 10 分鐘內的定位快取有效
        },
      );
    });
  }, []);

  const coordsRef = useRef<Coords | null>(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let permissionStatusObj: PermissionStatus | null = null;

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          permissionStatusObj = res;
          setPermissionStatus(res.state);

          // 只有在「沒有有效快取」時才自動發起定位
          if (!coordsRef.current) {
            if (res.state === "granted" || res.state === "prompt") {
              requestLocation();
            }
          }

          res.onchange = () => {
            setPermissionStatus(res.state);
            // 當用戶在當前頁面授權為 granted 且無快取時觸發
            if (res.state === "granted" && !coordsRef.current) {
              requestLocation();
            }
          };
        })
        .catch(() => {
          // 部分瀏覽器不支援 permissions query，若無快取則嘗試定位
          if (!coordsRef.current) requestLocation();
        });
    } else {
      if (!coordsRef.current) requestLocation();
    }

    return () => {
      if (permissionStatusObj) {
        permissionStatusObj.onchange = null;
      }
    };
  }, [requestLocation]);

  const contextValue = React.useMemo(
    () => ({
      coords,
      loading,
      error,
      permissionStatus,
      requestLocation,
    }),
    [coords, loading, error, permissionStatus, requestLocation],
  );

  return (
    <LocationContext.Provider value={contextValue}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
};
