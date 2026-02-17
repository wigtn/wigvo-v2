import { Redirect, Slot } from "expo-router";
import { useAuth } from "../../lib/AuthContext";
import { ActivityIndicator, View } from "react-native";

export default function MainLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}
