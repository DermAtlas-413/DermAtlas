import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuthStore } from "@/state/auth-store";
import { useCurrentCaseStore } from "@/state/current-case-store";
import { useRequireRole } from "@/hooks/use-require-role";
import { analyzeLesion } from "@/services/lesion-service";
import { DEMO_IMAGES, DEMO_UPLOAD_IMAGE } from "@/constants/demo-images";
import type { AnalyzeMatch } from "@/types/api";
import { displayRole } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";
// === NEW: added Modal and TextInput ===
import { Modal, TextInput } from "react-native";

export default function Compare() {
  const authorized = useRequireRole("PCP");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { queryId } = useLocalSearchParams<{ queryId?: string }>();
  const patientName = useCurrentCaseStore((s) => s.patientName);
  const patientMrn = useCurrentCaseStore((s) => s.patientMrn);
  const patientId = useCurrentCaseStore((s) => s.patientId);
  const imageUri = useCurrentCaseStore((s) => s.imageUri);
  const setFeedbackTarget = useCurrentCaseStore((s) => s.setFeedbackTarget);
  const [matches, setMatches] = useState<AnalyzeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // === NEW: modal visibility state ===
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [selectedPCP, setSelectedPCP] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sentConsult, setSentConsult] = useState<any>(null);

  const patientLabel = patientName || patientMrn || (patientId ? `ID # ${patientId}` : "—");

  useEffect(() => {
    if (!authorized) return;
    setError(null);
    analyzeLesion(queryId ?? "mock")
      .then((res) => setMatches(res.results))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [queryId, authorized]);

  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Analysis Results</Text>
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
          {/* Patient strip */}
          <View style={styles.patientStrip}>
            <MaterialCommunityIcons
              name="card-account-details-outline"
              size={14}
              color={D.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.patientText}>Patient: {patientLabel}</Text>
              {patientMrn && patientName ? (
                <Text style={styles.patientMeta}>{patientMrn} · ID #{patientId}</Text>
              ) : patientId ? (
                <Text style={styles.patientMeta}>ID #{patientId}</Text>
              ) : null}
            </View>
          </View>

          {/* Submitted image */}
          <View style={styles.imageSection}>
            <Text style={styles.sectionLabel}>Submitted Image</Text>
            <View style={styles.imageCard}>
              <Image
                source={imageUri ? { uri: imageUri } : DEMO_UPLOAD_IMAGE}
                style={styles.submittedImage}
                contentFit="cover"
              />
            </View>
          </View>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={D.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Similar cases */}
          <View>
            <Text style={styles.sectionLabel}>
              Similar Cases &nbsp;
              <Text style={styles.sectionCount}>
                {matches.length} matches
              </Text>
            </Text>
            {loading ? (
              <ActivityIndicator size="large" color={D.primary} style={{ marginTop: 20 }} />
            ) : (
            <View style={styles.grid}>
              {matches.map((m) => (
                <MatchCard
                  key={m.reference_id}
                  m={m}
                  onPress={() => {
                    const similarity = Math.round(m.score * 100);
                    setFeedbackTarget({
                      matchId: m.reference_id,
                      referenceId: m.reference_id,
                      diagnosis: m.diagnosis_label ?? "",
                      similarity,
                      referenceImageUri: m.gcs_uri ?? "",
                    });
                    router.push(`/feedback?matchId=${m.reference_id}&referenceId=${m.reference_id}`);
                  }}
                />
              ))}
            </View>
            )}
          </View>
          {/* === NEW: Second opinion button === */}
          <View style={{ marginTop: 20 }}>
            <Pressable
            onPress={() => {
              setSelectedPCP(null);
              setMessage("");
              setShowConsultModal(true);
            }}
            style={{
              backgroundColor: D.primary,
              padding: 14,
              borderRadius: 10,
              alignItems: "center",
            }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>
                Request Second Opinion
                </Text>
                </Pressable>
           </View>
        </View>
      </ScrollView>
      {/* === NEW: Consultation modal === */}
<Modal visible={showConsultModal} transparent animationType="slide">
  <View
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      padding: 20,
    }}
  >
    <View
      style={{
        backgroundColor: "white",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
        Request Second Opinion
      </Text>
      <Text style={{ marginBottom: 8 }}>Select PCP</Text>

{[
  { email: "dr.quach@hospital.com", name: "Dr. Quach" },
  { email: "dr.patel@hospital.com", name: "Dr. Patel" },
  { email: "dr.chen@hospital.com", name: "Dr. Chen" },
].map((p) => (
  <Pressable
    key={p.email}
    onPress={() => setSelectedPCP(p.email)}
    style={{
      padding: 10,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor:
        selectedPCP === p.email ? D.primary : "#eee",
    }}
  >
    <Text
      style={{
        color: selectedPCP === p.email ? "white" : "black",
        fontWeight: "600",
      }}
    >
      {p.name}
    </Text>
  </Pressable>
))}

        {imageUri && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
              Attached Image
            </Text>
            <Image
              source={{ uri: imageUri }}
              style={{
                width: "50%",
                aspectRatio: 1.5,
                maxHeight: 400,
                borderRadius: 8,
              }}
                contentFit="cover"
            />
          </View>
        )}
      <Text style={{ marginBottom: 4 }}>Message</Text>
      <TextInput
      placeholder="Add message..."
      multiline
      value={message}
      onChangeText={setMessage}
      style={{
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        padding: 10,
        height: 80,
        }}
      />

      <View style={{ flexDirection: "row", marginTop: 16, gap: 10 }}>
        <Pressable
          onPress={() => setShowConsultModal(false)}
          style={{
            flex: 1,
            padding: 12,
            backgroundColor: "#ddd",
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <Text>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (!selectedPCP) {
              alert("Please select a PCP");
              return;
            }
            const consultPayload = {
              from: user?.fullName,
              to: selectedPCP,
              message,
              queryId,
              image: imageUri,
              matches,
            }

            setSentConsult(consultPayload);
            
            alert(`Second opinion request sent to ${selectedPCP}`);

            setMessage("");
            setSelectedPCP(null);
            setShowConsultModal(false);

          }}
          style={{
            flex: 1,
            padding: 12,
            backgroundColor: D.primary,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            Send
          </Text>
        </Pressable>
      </View>
    </View>
  </View>
</Modal>
    </SafeAreaView>
  );
}

function MatchCard({
  m,
  onPress,
}: {
  m: AnalyzeMatch;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const similarity = Math.round(m.score * 100);
  const imgSource = imgError
    ? null
    : m.gcs_uri
    ? { uri: m.gcs_uri }
    : (DEMO_IMAGES[m.reference_id] ?? null);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.matchCard,
        pressed && styles.matchCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.matchImage}>
        {imgSource ? (
          <Image
            source={imgSource}
            style={styles.matchImageFill}
            contentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <MaterialCommunityIcons
            name="image-off-outline"
            size={32}
            color={D.border}
          />
        )}
      </View>

      <View style={styles.matchBody}>
        <View style={styles.matchTopRow}>
          <SimilarityBadge value={similarity} />
          <View style={styles.voteRow}>
            <Pressable hitSlop={8} onPress={() => {}}>
              <MaterialCommunityIcons
                name="thumb-up-outline"
                size={15}
                color={D.muted}
              />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => {}}>
              <MaterialCommunityIcons
                name="thumb-down-outline"
                size={15}
                color={D.muted}
              />
            </Pressable>
          </View>
        </View>

        <SimilarityBar value={similarity} />

        <Text style={styles.matchDiag} numberOfLines={2}>
          {m.diagnosis_label ?? "Unknown"}
        </Text>

        <View style={styles.viewMoreRow}>
          <Text style={styles.viewMoreText}>View details</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={13}
            color={D.primary}
          />
        </View>
      </View>
    </Pressable>
  );
}

function SimilarityBar({ value }: { value: number }) {
  const color =
    value >= 85 ? D.success : value >= 75 ? D.warning : D.danger;
  return (
    <View style={bar.wrap}>
      <View
        style={[bar.fill, { width: `${value}%` as `${number}%`, backgroundColor: color }]}
      />
    </View>
  );
}

function SimilarityBadge({ value }: { value: number }) {
  const color =
    value >= 85 ? D.success : value >= 75 ? D.warning : D.danger;
  const bg =
    value >= 85 ? D.successBg : value >= 75 ? D.warningBg : D.dangerBg;
  return (
    <View style={[bar.badge, { backgroundColor: bg }]}>
      <Text style={[bar.badgeText, { color }]}>{value}%</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  wrap: {
    height: 4,
    backgroundColor: D.barTrack,
    borderRadius: 4,
    marginVertical: 6,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
});

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
    maxWidth: 700,
    alignSelf: "center",
    width: "100%",
  },

  patientStrip: {
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
  patientText: { color: D.text, fontSize: 13, fontWeight: "600" },
  patientMeta: { color: D.muted, fontSize: 11, fontWeight: "500", marginTop: 2 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.dangerBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: D.danger,
  },
  errorText: { color: D.danger, fontSize: 13, fontWeight: "600", flex: 1 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  sectionCount: { color: D.muted, fontWeight: "500" },

  imageSection: {},
  imageCard: {
    backgroundColor: D.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
    height: 220,
  },
  submittedImage: {
    width: "100%",
    height: "100%",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  matchCard: {
    width: "48%",
    backgroundColor: D.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
  },
  matchCardPressed: { opacity: 0.85 },
  matchImage: {
    height: 120,
    backgroundColor: D.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
  },
  matchImageFill: {
    width: "100%",
    height: "100%",
  },
  matchCaseId: { color: D.muted, fontSize: 11, fontWeight: "600" },
  matchBody: { padding: 10, gap: 2 },
  matchTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  voteRow: { flexDirection: "row", gap: 8 },
  matchDiag: { color: D.text, fontSize: 12, fontWeight: "600" },
  viewMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  viewMoreText: { color: D.primary, fontSize: 11, fontWeight: "600" },
});
