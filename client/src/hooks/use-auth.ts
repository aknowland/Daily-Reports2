import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import type { UserProfile } from "@shared/schema";

type UserWithProfile = User & { profile?: UserProfile };

async function fetchUser(): Promise<UserWithProfile | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const user = await response.json();
  
  // Fetch user profile to get role
  try {
    const profileResponse = await fetch("/api/auth/profile", {
      credentials: "include",
    });
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      return { ...user, profile };
    }
  } catch (e) {
    // Profile fetch failed, continue without it
  }
  
  return user;
}

async function logout(): Promise<void> {
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<UserWithProfile | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    profile: user?.profile,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.profile?.role === "admin",
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
