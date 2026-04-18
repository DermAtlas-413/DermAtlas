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
import { useRouter, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRequireRole } from "@/hooks/use-require-role";
import { getMyCaseDetail } from "@/services/patient-service";
import type { ClinicalImageDetail } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

function formatDate(isoStr: string | null): string {
  if (!isoStr) return "Unknown date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

export default function CaseDetail() {
  const authorized = useRequireRole("PATIENT");
  const router = useRouter();
  const { queryId } = useLocalSearchParams<{ queryId: string }>();
  const [data, setData] = useState<ClinicalImageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!authorized || !queryId) return;
    setError(null);
    getMyCaseDetail(queryId)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load case.");
      })
      .finally(() => setLoading(false));
  }, [authorized, queryId]);

  if (!authorized) return null;

  const hasImage = !!data?.gcs_uri && !imgError;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Case Details</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={D.primary} />
            <Text style={styles.loadingText}>Loading case...</Text>
          </View>
        )}

        {/* Error */}
        {!loading && error && (
          <View style={styles.page}>
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={D.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryText}>Go Back</Text>
            </Pressable>
          </View>
        )}

        {/* Case detail */}
        {!loading && !error && data && (
          <View style={styles.page}>
            {/* Image */}
            <View style={styles.imageCard}>
              {hasImage ? (
                <Image
                  source={{ uri: data.gcs_uri }}
                  style={styles.caseImage}
                  contentFit="cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <MaterialCommunityIcons name="image-outline" size={56} color={D.border} />
                  <Text style={styles.imagePlaceholderText}>No image available</Text>
                </View>
              )}
            </View>

            {/* Location & Date */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <MaterialCommunityIcons name="map-marker-outline" size={20} color={D.primary} />
                <Text style={styles.infoTitle}>{data.lesion_location}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="calendar-outline" size={16} color={D.muted} />
                <Text style={styles.infoValue}>{formatDate(data.captured_at)}</Text>
              </View>
              {data.physician_name && (
                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="stethoscope" size={16} color={D.muted} />
                  <Text style={styles.infoValue}>{data.physician_name}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <MaterialCommunityIcons name="identifier" size={16} color={D.muted} />
                <Text style={styles.infoValueMono}>{data.query_id.slice(-12)}</Text>
              </View>
            </View>

            {/* Clinician Notes */}
            <View style={styles.notesCard}>
              <View style={styles.notesHeader}>
                <MaterialCommunityIcons name="note-text-outline" size={18} color={D.primary} />
                <Text style={styles.notesTitle}>Physician Notes</Text>
              </View>
              <View style={styles.divider} />
              {data.clinician_notes ? (
                <Text style={styles.notesBody}>{data.clinician_notes}</Text>
              ) : (
                <View style={styles.noNotesState}>
                  <MaterialCommunityIcons name="text-box-remove-outline" size={24} color={D.border} />
                  <Text style={styles.noNotesText}>
                    No notes have been added for this case yet.
                  </Text>
                </View>
              )}
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
              <MaterialCommunityIcons name="information-outline" size={14} color={D.muted} />
              <Text style={styles.disclaimerText}>
                This information is shared by your physician for your reference.
                Contact your doctor with any questions or concerns.
              </Text>
            </View>
          </View>
        )}
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: D.onPrimaryOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: D.onPrimary, fontWeight: "700", fontSize: 17 },

  scroll: { flexGrow: 1 },
  page: {
    padding: 20,
    gap: 16,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 12,
  },
  loadingText: { color: D.muted, fontSize: 14, fontWeight: "500" },

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
  retryBtn: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: D.primary,
  },
  retryText: { color: D.onPrimary, fontWeight: "700", fontSize: 14 },

  imageCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
    backgroundColor: D.surface,
  },
  caseImage: {
    width: "100%",
    height: 260,
  },
  imagePlaceholder: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: D.bg,
  },
  imagePlaceholderText: { color: D.muted, fontSize: 13, fontWeight: "500" },

  infoCard: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoTitle: { color: D.text, fontSize: 18, fontWeight: "700", flex: 1 },
  divider: {
    height: 1,
    backgroundColor: D.border,
    marginVertical: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoValue: { color: D.text, fontSize: 14, fontWeight: "500" },
  infoValueMono: { color: D.muted, fontSize: 12, fontWeight: "500", fontFamily: "monospace" },

  notesCard: {
    backgroundColor: D.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: D.border,
    gap: 12,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notesTitle: { color: D.text, fontSize: 15, fontWeight: "700" },
  notesBody: {
    color: D.text,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 22,
  },
  noNotesState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  noNotesText: { color: D.muted, fontSize: 13, textAlign: "center" },

  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  disclaimerText: {
    color: D.muted,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
    flex: 1,
  },
});
