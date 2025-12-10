import { useMemo } from "react";

export function useAuth() {
  // 不再需要认证，所有用户都被视为已认证
  const state = useMemo(() => {
    return {
      user: null,
      loading: false,
      error: null,
      isAuthenticated: true,
    };
  }, []);

  return {
    ...state,
    refresh: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
}
