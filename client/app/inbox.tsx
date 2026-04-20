import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Modal,
  TextInput,
} from "react-native";
import { useAuthStore } from "@/state/auth-store";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import { useRouter } from "expo-router";

export default function Inbox() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const [showReplyModal, setShowReplyModal] = React.useState(false);
  const [replyMessage, setReplyMessage] = React.useState("");
  const [selectedConsult, setSelectedConsult] = React.useState<any>(null);

  const mockConsults = [
    {
      from: "Dr. Chen",
      to: user?.fullName ?? "Dr. Quach",
      message: "Suspicious lesion, please review.",
      queryId: "999",
      image: require("../assets/images/melanocytic-naevus.webp"),
    },
  ];

  const inbox = mockConsults.filter(
    (c) => c.to === user?.fullName
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header (Profile-style) */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={D.onPrimary}
          />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSubtitle}>
            {user?.fullName ?? "—"} · Physician
          </Text>
        </View>

        {/* Spacer for alignment */}
        <View style={{ width: 38, height: 38 }} />
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
                {c.image && (
                  <Image
                    source={c.image}
                    style={styles.caseImage}
                    resizeMode="cover"
                  />
                )}

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

                <Text style={styles.message}>
                  "{c.message}"
                </Text>

                <Text style={styles.meta}>
                  Query ID: {c.queryId}
                </Text>

                <View style={styles.replyRow}>
                  <Pressable
                    onPress={() => {
                      setSelectedConsult(c);
                      setShowReplyModal(true);
                    }}
                    style={styles.replyBtn}
                  >
                    <Text style={styles.replyText}>Reply</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Reply Modal */}
      <Modal visible={showReplyModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reply</Text>

            <Text style={{ marginBottom: 8 }}>
              To: {selectedConsult?.from}
            </Text>

            <TextInput
              placeholder="Write your reply..."
              value={replyMessage}
              onChangeText={setReplyMessage}
              multiline
              style={styles.input}
            />

            <View style={styles.modalRow}>
              <Pressable
                onPress={() => setShowReplyModal(false)}
                style={styles.cancelBtn}
              >
                <Text>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const replyPayload = {
                    from: user?.fullName,
                    to: selectedConsult?.from,
                    message: replyMessage,
                    originalQuery: selectedConsult?.queryId,
                  };

                  console.log("REPLY SENT:", replyPayload);
                  alert("Reply sent");

                  setReplyMessage("");
                  setShowReplyModal(false);
                }}
                style={styles.sendBtn}
              >
                <Text style={{ color: "white" }}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: D.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: D.onPrimaryOverlay,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
  },

  headerTitle: {
    color: D.onPrimary,
    fontWeight: "700",
    fontSize: 17,
  },

  headerSubtitle: {
    color: D.onPrimaryMuted,
    fontSize: 11,
    fontWeight: "500",
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
    gap: 8,
  },

  caseImage: {
    width: "100%",
    height: 140,
    borderRadius: 10,
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

  replyRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },

  replyBtn: {
    backgroundColor: D.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },

  replyText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },

  emptyText: {
    color: D.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 40,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    height: 80,
  },

  modalRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 10,
  },

  cancelBtn: {
    flex: 1,
    backgroundColor: "#ddd",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  sendBtn: {
    flex: 1,
    backgroundColor: D.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
});