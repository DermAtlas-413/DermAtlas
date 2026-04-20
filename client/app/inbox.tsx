import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useAuthStore } from "@/state/auth-store";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Inbox() {
  const user = useAuthStore((s) => s.user);

  // 🔥 mock (나중에 store로 교체 가능)
  const mockConsults = [
    {
      from: "Dr. Smith",
      to: "Dr. Chen",
      message: "Suspicious lesion on forearm.",
      queryId: "123",
    },
    {
      from: "Dr. Patel",
      to: "Dr. Chen",
      message: "Please confirm diagnosis.",
      queryId: "456",
    },
  ];

  // mock
  const inbox = mockConsults.filter(
    (c) => c.to === user?.fullName
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Consultation Inbox</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {inbox.length === 0 ? (
            <Text style={styles.emptyText}>
              No consultation requests
            </Text>
          ) : (
            inbox.map((c, idx) => (
              <View key={idx} style={styles.card}>
                {/* Top row */}
                <View style={styles.topRow}>
                  <MaterialCommunityIcons
                    name="account-circle-outline"
                    size={18}
                    color={D.primary}
                  />
                  <Text style={styles.fromText}>
                    {c.from} → {c.to}
                  </Text>
                </View>

                {/* Message */}
                <Text style={styles.message}>
                  "{c.message}"
                </Text>

                {/* Meta */}
                <Text style={styles.meta}>
                  Query ID: {c.queryId}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: D.bg,
  },

  header: {
    backgroundColor: D.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: D.onPrimary,
    fontWeight: "700",
    fontSize: 18,
  },

  scroll: {
    flexGrow: 1,
  },

  page: {
    padding: 20,
    gap: 12,
    maxWidth: 700,
    alignSelf: "center",
    width: "100%",
  },

  card: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 6,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  fromText: {
    color: D.text,
    fontWeight: "600",
    fontSize: 13,
  },

  message: {
    color: D.text,
    fontSize: 14,
    fontWeight: "500",
  },

  meta: {
    color: D.muted,
    fontSize: 11,
    marginTop: 4,
  },

  emptyText: {
    color: D.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 40,
  },
});