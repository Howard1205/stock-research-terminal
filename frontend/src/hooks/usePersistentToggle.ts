import { useCallback, useState } from "react";

export function usePersistentToggle(key: string, defaultValue: boolean) {
  const [open, setOpen] = useState(() => {
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "true";
  });

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      window.localStorage.setItem(key, String(next));
      return next;
    });
  }, [key]);

  return [open, toggle] as const;
}
