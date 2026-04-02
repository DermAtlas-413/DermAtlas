import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { submitFeedback } from "@/services/feedback-service";
import { useAuthStore } from "@/state/auth-store";
import { useRequireRole } from "@/hooks/use-require-role";
import { ComparisonModal } from "@/components/comparison-modal";
import { DEMO_IMAGES, DEMO_UPLOAD_IMAGE } from "@/constants/demo-images";
import { displayRole } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Feedback() {
  const authorized = useRequireRole("PCP");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const {
    matchId,
    queryId,
    referenceId,
    diagnosis,
    similarity,
    imageUri,
    referenceImageUri,
  } = useLocalSearchParams<{
    matchId?: string;
    queryId?: string;
    referenceId?: string;
    diagnosis?: string;
    similarity?: string;
    imageUri?: string;
    referenceImageUri?: string;
  }>();

  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [compareVisible, setCompareVisible] = useState(false);

  if (!authorized) return null;

  const uploadedSource = imageUri
    ? { uri: decodeURIComponent(imageUri) }
    : DEMO_UPLOAD_IMAGE;

  const referenceSource = referenceImageUri
    ? { uri: decodeURIComponent(referenceImageUri) }
    : (referenceId ? DEMO_IMAGES[referenceId] : undefined);

  async function handleVote(direction: "up" | "down") {
    const next = vote === direction ? null : direction;
    setVote(next);
    if (next === null) return;
    if (!queryId || !referenceId) return;
    setSubmitting(true);
    try {
      await submitFeedback(queryId, referenceId, next === "up");
    } catch {
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
      setVote(vote);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Similar Case · Match #{matchId ?? "—"}</Text>
          <Text style={styles.headerSubtitle}>
            {user?.fullName ?? "—"} · {displayRole(user?.role)}
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
          <Pressable
            style={styles.headerBtnAlt}
            onPress={() => {
              clearAuth();
              router.replace("/");
            }}
          >
            <Text style={styles.headerBtnAltText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {/* Image comparison section */}
          <View style={styles.comparisonSection}>
            <View style={styles.comparisonHeader}>
              <Text style={styles.sectionLabel}>Image Comparison</Text>
            </View>

            {/* Compact thumbnail preview */}
            <View style={styles.thumbnailRow}>
              <View style={styles.thumbnailPanel}>
                <Image
                  source={uploadedSource}
                  style={styles.thumbnail}
                  contentFit="cover"
                />
                <Text style={styles.thumbnailLabel}>Your Image</Text>
              </View>
              <View style={styles.thumbnailDivider} />
              <View style={styles.thumbnailPanel}>
                <Image
                  source={referenceSource ?? undefined}
                  style={styles.thumbnail}
                  contentFit="cover"
                />
                <Text style={styles.thumbnailLabel}>Case Match</Text>
              </View>
            </View>

            {/* Expand button */}
            <Pressable
              style={({ pressed }) => [
                styles.expandBtn,
                pressed && styles.expandBtnPressed,
              ]}
              onPress={() => setCompareVisible(true)}
            >
              <MaterialCommunityIcons
                name="arrow-expand"
                size={17}
                color={D.onPrimary}
              />
              <Text style={styles.expandText}>Full Comparison</Text>
            </Pressable>
          </View>

          {/* Diagnosis and similarity */}
          <View style={styles.metaRow}>
            <View style={styles.metaCard}>
              <MaterialCommunityIcons
                name="stethoscope"
                size={18}
                color={D.primary}
              />
              <View style={styles.metaCardContent}>
                <Text style={styles.metaCardLabel}>Diagnosis</Text>
                <Text style={styles.metaCardValue} numberOfLines={2}>
                  {diagnosis ?? "—"}
                </Text>
              </View>
            </View>
            <View style={styles.metaCard}>
              <MaterialCommunityIcons
                name="chart-bar"
                size={18}
                color={D.primary}
              />
              <View style={styles.metaCardContent}>
                <Text style={styles.metaCardLabel}>Similarity</Text>
                <Text style={styles.metaCardValue}>
                  {similarity != null ? `${similarity}%` : "—"}
                </Text>
              </View>
            </View>
          </View>

          {/* Feedback */}
          <View style={styles.feedbackSection}>
            <Text style={styles.sectionLabel}>Clinical Feedback</Text>
            <Text style={styles.feedbackQuestion}>
              Does this match assist with your clinical assessment?
            </Text>

            <View style={styles.voteRow}>
              <Pressable
                style={[styles.voteBtn, vote === "up" && styles.voteBtnUp]}
                onPress={() => handleVote("up")}
                disabled={submitting}
              >
                <MaterialCommunityIcons
                  name={vote === "up" ? "thumb-up" : "thumb-up-outline"}
                  size={24}
                  color={vote === "up" ? D.onPrimary : D.primary}
                />
                <Text
                  style={[
                    styles.voteLabel,
                    vote === "up" && styles.voteLabelActive,
                  ]}
                >
                  Helpful
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.voteBtn,
                  vote === "down" && styles.voteBtnDown,
                ]}
                onPress={() => handleVote("down")}
                disabled={submitting}
              >
                <MaterialCommunityIcons
                  name={vote === "down" ? "thumb-down" : "thumb-down-outline"}
                  size={24}
                  color={vote === "down" ? D.onPrimary : D.muted}
                />
                <Text
                  style={[
                    styles.voteLabel,
                    vote === "down" && styles.voteLabelActive,
                    vote === "down" && styles.voteLabelDown,
                  ]}
                >
                  Not Helpful
                </Text>
              </Pressable>
            </View>

            {submitting && (
              <Text style={styles.statusText}>Saving feedback…</Text>
            )}
            {!submitting && vote !== null && (
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={14}
                  color={D.success}
                />
                <Text style={styles.statusSuccess}>Feedback recorded</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <ComparisonModal
        visible={compareVisible}
        onClose={() => setCompareVisible(false)}
        uploadedSource={uploadedSource}
        referenceSource={referenceSource}
        uploadedSublabel="Patient Upload"
        referenceSublabel={diagnosis ?? undefined}
      />
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

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
  },

  // Comparison section
  comparisonSection: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  comparisonHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  thumbnailRow: {
    flexDirection: "row",
    height: 140,
    gap: 0,
  },
  thumbnailPanel: {
    flex: 1,
    gap: 6,
  },
  thumbnail: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: D.bg,
    borderWidth: 1,
    borderColor: D.border,
  },
  thumbnailLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: D.muted,
    textAlign: "center",
  },
  thumbnailDivider: {
    width: 1,
    backgroundColor: D.border,
    marginHorizontal: 8,
    marginBottom: 22, // below the label area
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: D.primary,
    borderRadius: 10,
    paddingVertical: 11,
  },
  expandBtnPressed: { opacity: 0.85 },
  expandText: {
    color: D.onPrimary,
    fontWeight: "700",
    fontSize: 14,
  },

  // Meta
  metaRow: { flexDirection: "row", gap: 12 },
  metaCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: D.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
  },
  metaCardContent: { flex: 1 },
  metaCardLabel: {
    fontSize: 11,
    color: D.muted,
    fontWeight: "600",
    marginBottom: 2,
  },
  metaCardValue: { fontSize: 14, color: D.text, fontWeight: "700" },

  // Feedback
  feedbackSection: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  feedbackQuestion: {
    fontSize: 13,
    color: D.muted,
    fontWeight: "500",
    lineHeight: 18,
  },

  voteRow: { flexDirection: "row", gap: 12 },
  voteBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: D.border,
    backgroundColor: D.bg,
  },
  voteBtnUp: { backgroundColor: D.primary, borderColor: D.primary },
  voteBtnDown: { backgroundColor: D.danger, borderColor: D.danger },
  voteLabel: { color: D.primary, fontWeight: "700", fontSize: 13 },
  voteLabelActive: { color: D.onPrimary },
  voteLabelDown: { color: D.onPrimary },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, color: D.muted, fontWeight: "600" },
  statusSuccess: { fontSize: 12, color: D.success, fontWeight: "600" },
});
