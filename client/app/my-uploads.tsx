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
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuthStore } from "@/state/auth-store";
import { useRequireRole } from "@/hooks/use-require-role";
import { getMyUploads } from "@/services/patient-service";
import type { PcpCaseSummary } from "@/types/api";
import { displayRole } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

function formatDate(isoStr: string | null): string {
  if (!isoStr) return "Unknown date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

export default function MyUploads() {
  const authorized = useRequireRole("PCP");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [cases, setCases] = useState<PcpCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authorized) return;
    setError(null);
    getMyUploads()
      .then(setCases)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load cases.");
      })
      .finally(() => setLoading(false));
  }, [authorized]);

  if (!authorized) return null;

  const count = cases.length;

  function handleLogout() {
    clearAuth();
    router.replace("/");
  }

  function handleCasePress(queryId: string) {
    router.push(`/compare?queryId=${encodeURIComponent(queryId)}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Uploads</Text>
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
          <Pressable style={styles.headerBtnAlt} onPress={handleLogout}>
            <Text style={styles.headerBtnAltText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          <Text style={styles.sectionLabel}>
            Previous Cases{" "}
            {!loading && !error && (
              <Text style={styles.sectionCount}>
                {count} {count === 1 ? "case" : "cases"}
              </Text>
            )}
          </Text>

          {loading && (
            <ActivityIndicator size="large" color={D.primary} style={{ marginTop: 20 }} />
          )}

          {!loading && error && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={D.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && count === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="clipboard-text-off-outline"
                size={48}
                color={D.border}
              />
              <Text style={styles.emptyTitle}>No uploads yet</Text>
              <Text style={styles.emptySubtitle}>
                Cases you upload will appear here for later review.
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => router.push("/upload")}
              >
                <Text style={styles.primaryBtnText}>Upload a new case</Text>
              </Pressable>
            </View>
          )}

          {!loading && !error && count > 0 && (
            <View style={styles.tileGrid}>
              {cases.map((c) => (
                <CaseCard
                  key={c.query_id}
                  item={c}
                  onPress={() => handleCasePress(c.query_id)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CaseCard({
  item,
  onPress,
}: {
  item: PcpCaseSummary;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !!item.gcs_uri && !imgError;

  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={onPress}
    >
      <View style={styles.tileThumbnail}>
        {hasImage ? (
          <Image
            source={{ uri: item.gcs_uri }}
            style={styles.tileThumbnailImage}
            contentFit="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={styles.tilePlaceholder}>
            <MaterialCommunityIcons name="image-outline" size={32} color={D.border} />
          </View>
        )}
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tilePatient} numberOfLines={1}>
          {item.patient_name ?? "Unknown patient"}
        </Text>
        <View style={styles.tileLocationRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={D.primary} />
          <Text style={styles.tileLocation} numberOfLines={1}>
            {item.lesion_location}
          </Text>
        </View>
        <Text style={styles.tileMeta}>{formatDate(item.captured_at)}</Text>
        <View style={styles.tileTagRow}>
          {item.patient_mrn ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.patient_mrn}</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.tag,
              item.visible_to_patient ? styles.tagVisible : styles.tagHidden,
            ]}
          >
            <MaterialCommunityIcons
              name={item.visible_to_patient ? "eye-outline" : "eye-off-outline"}
              size={10}
              color={item.visible_to_patient ? D.primary : D.muted}
            />
            <Text
              style={[
                styles.tagText,
                item.visible_to_patient ? styles.tagVisibleText : styles.tagHiddenText,
              ]}
            >
              {item.visible_to_patient ? "Shared" : "Private"}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.tileFooter}>
        <Text style={styles.tileAction}>View Results</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={D.primary} />
      </View>
    </Pressable>
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
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
  },
  sectionCount: { color: D.muted, fontWeight: "500" },

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

  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: { color: D.text, fontSize: 16, fontWeight: "600" },
  emptySubtitle: {
    color: D.muted,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: D.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryBtnText: { color: D.onPrimary, fontWeight: "700", fontSize: 13 },

  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  tile: {
    width: "100%",
    maxWidth: 340,
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: D.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: D.border,
    overflow: "hidden",
  },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileThumbnail: {
    height: 140,
    backgroundColor: D.bg,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  tileThumbnailImage: { width: "100%", height: "100%" },
  tilePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBody: { padding: 14, gap: 4 },
  tilePatient: { color: D.text, fontSize: 15, fontWeight: "700" },
  tileLocationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tileLocation: { color: D.text, fontSize: 13, fontWeight: "600", flex: 1 },
  tileMeta: { color: D.muted, fontSize: 12, fontWeight: "500" },
  tileTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: D.bg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: D.border,
  },
  tagText: { color: D.muted, fontSize: 10, fontWeight: "600" },
  tagVisible: { backgroundColor: D.infoSurface, borderColor: D.primary },
  tagVisibleText: { color: D.primary },
  tagHidden: {},
  tagHiddenText: {},
  tileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 2,
  },
  tileAction: { color: D.primary, fontSize: 12, fontWeight: "700" },
});
