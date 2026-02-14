import { useLocalSearchParams, useRouter } from "expo-router";
import { RealtimeCallView } from "../../components/call/RealtimeCallView";
import type { InputMode } from "../../lib/types";

export default function CallScreen() {
  const { callId, initialMode } = useLocalSearchParams<{
    callId: string;
    initialMode?: string;
  }>();
  const router = useRouter();

  if (!callId) {
    router.back();
    return null;
  }

  return (
    <RealtimeCallView
      callId={callId}
      onCallEnd={() => router.back()}
      fontScale={1.0}
      initialMode={(initialMode as InputMode) ?? "voice"}
    />
  );
}
