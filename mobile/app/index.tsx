import { Redirect } from "expo-router";
import { useAuth } from "@/auth";

// Entry route — the root layout's navigator also guards routes, but this gives
// a deterministic first destination without a flash of empty content.
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? "/(tabs)" : "/(auth)/login"} />;
}
