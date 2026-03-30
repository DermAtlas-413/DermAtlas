import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/state/auth-store";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Upload() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [patientId, setPatientId] = useState("");

  function handleLogout() {
    clearAuth();
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBtn} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New Case</Text>
          <Text style={styles.headerSubtitle}>
            {user?.fullName ?? "—"} · {user?.role ?? "—"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => router.push("/profile")}
          >
            <MaterialCommunityIcons
              name="account-circle-outline"
              size={22}
              color={D.onPrimary}
            />
          </Pressable>
          <Pressable style={styles.headerBtnAlt} onPress={handleLogout}>
            <Text style={styles.headerBtnAltText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {/* Patient ID */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Patient Information</Text>
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons
                name="card-account-details-outline"
                size={18}
                color={D.muted}
              />
              <TextInput
                value={patientId}
                onChangeText={setPatientId}
                placeholder="Patient ID"
                placeholderTextColor={D.muted}
                style={styles.input}
              />
            </View>
          </View>

          {/* Image upload */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Lesion Image</Text>
            <View style={styles.imageCard}>
              <View style={styles.imagePlaceholder}>
                <MaterialCommunityIcons
                  name="image-outline"
                  size={52}
                  color={D.border}
                />
                <Text style={styles.imagePlaceholderText}>
                  No image selected
                </Text>
                <Text style={styles.imagePlaceholderSub}>
                  Full lesion in frame, well-lit
                </Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    pressed && styles.actionCardPressed,
                  ]}
                >
                  <View style={styles.actionIconWrap}>
                    <MaterialCommunityIcons
                      name="camera-outline"
                      size={26}
                      color={D.primary}
                    />
                  </View>
                  <Text style={styles.actionLabel}>Camera</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    pressed && styles.actionCardPressed,
                  ]}
                >
                  <View style={styles.actionIconWrap}>
                    <MaterialCommunityIcons
                      name="image-plus"
                      size={26}
                      color={D.primary}
                    />
                  </View>
                  <Text style={styles.actionLabel}>Upload</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Guideline */}
          <View style={styles.guideCard}>
            <MaterialCommunityIcons
              name="information-outline"
              size={16}
              color={D.primary}
            />
            <Text style={styles.guideText}>
              Ensure the full lesion is visible, the image is in focus, and
              lighting is uniform for best results.
            </Text>
          </View>

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && styles.submitBtnPressed,
            ]}
            onPress={() => router.push("/compare")}
          >
            <MaterialCommunityIcons name="send" size={18} color={D.onPrimary} />
            <Text style={styles.submitText}>Submit for Analysis</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: D.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: D.onPrimaryOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: D.onPrimary, fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: D.onPrimaryMuted, fontSize: 11, fontWeight: "500" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBtnAlt: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: D.onPrimaryOverlay,
  },
  headerBtnAltText: { color: D.onPrimary, fontWeight: "600", fontSize: 13 },

  scroll: { flexGrow: 1 },
  page: {
    padding: 20,
    gap: 16,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },

  infoStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: D.border,
  },
  infoStripText: { color: D.text, fontSize: 13, fontWeight: "600" },

  section: { gap: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: D.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  input: { flex: 1, fontSize: 15, color: D.text },

  imageCard: {
    backgroundColor: D.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
  },
  imagePlaceholder: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  imagePlaceholderText: { color: D.muted, fontWeight: "600", fontSize: 14 },
  imagePlaceholderSub: { color: D.border, fontSize: 12, fontWeight: "500" },

  actionRow: {
    flexDirection: "row",
    padding: 14,
    gap: 12,
  },
  actionCard: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: D.border,
    backgroundColor: D.bg,
  },
  actionCardPressed: { opacity: 0.8 },
  actionIconWrap: {},
  actionLabel: { color: D.primary, fontWeight: "700", fontSize: 13 },

  guideCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: D.infoSurface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  guideText: {
    color: D.primary,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    lineHeight: 18,
  },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: D.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    marginTop: 4,
  },
  submitBtnPressed: { opacity: 0.85 },
  submitText: { color: D.onPrimary, fontSize: 16, fontWeight: "700" },
});
