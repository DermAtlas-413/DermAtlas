import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuthStore } from "@/state/auth-store";
import { useCurrentCaseStore } from "@/state/current-case-store";
import { useRequireRole } from "@/hooks/use-require-role";
import { uploadImage } from "@/services/upload-service";
import { useImageCapture } from "@/hooks/use-image-capture";
import { PatientSelector } from "@/components/patient-selector";
import type { PatientResponse } from "@/types/api";
import { displayRole } from "@/types/api";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Upload() {
  const authorized = useRequireRole("PCP");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setCase = useCurrentCaseStore((s) => s.setCase);
  const [selectedPatient, setSelectedPatient] = useState<PatientResponse | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const NOTES_MAX = 2000;

  const { pickFromCamera, pickFromLibrary } = useImageCapture(setImageUri);

  if (!authorized) return null;

  function handleLogout() {
    clearAuth();
    router.replace("/");
  }

  async function handleSubmit() {
    if (!selectedPatient) {
      Alert.alert("No patient selected", "Please select a patient before submitting.");
      return;
    }
    if (!imageUri) {
      Alert.alert("No image selected", "Please capture or upload a lesion image first.");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const trimmedNotes = notes.trim();
      const res = await uploadImage(
        blob,
        selectedPatient.patient_id,
        "unspecified",
        trimmedNotes || undefined,
      );
      setCase({
        patientId: selectedPatient.patient_id,
        patientMrn: selectedPatient.mrn_internal,
        patientName: selectedPatient.full_name ?? "",
        queryId: res.query_id,
        imageUri,
      });
      router.push(`/compare?queryId=${encodeURIComponent(res.query_id)}`);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBtn} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New Case</Text>
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
          {/* Patient selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Patient Information</Text>
            <PatientSelector
              selectedPatient={selectedPatient}
              onSelect={setSelectedPatient}
            />
          </View>

          {/* Image upload */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Lesion Image</Text>
            <View style={styles.imageCard}>
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.imagePreview}
                  contentFit="cover"
                />
              ) : (
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
              )}

              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionCard,
                    pressed && styles.actionCardPressed,
                  ]}
                  onPress={pickFromCamera}
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
                  onPress={pickFromLibrary}
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

          {/* Clinician notes */}
          <View style={styles.section}>
            <View style={styles.notesHeader}>
              <Text style={styles.sectionLabel}>Notes / Diagnosis</Text>
              <Text style={styles.notesCounter}>
                {notes.length}/{NOTES_MAX}
              </Text>
            </View>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional clinical observations, working diagnosis, or differential..."
              placeholderTextColor={D.muted}
              multiline
              maxLength={NOTES_MAX}
              editable={!uploading}
              textAlignVertical="top"
            />
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
              (uploading || !selectedPatient) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={uploading || !selectedPatient}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={D.onPrimary} />
            ) : (
              <MaterialCommunityIcons name="send" size={18} color={D.onPrimary} />
            )}
            <Text style={styles.submitText}>
              {uploading ? "Uploading…" : "Submit for Analysis"}
            </Text>
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

  section: { gap: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: D.text,
    letterSpacing: 0.3,
  },

  imageCard: {
    backgroundColor: D.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: D.border,
  },
  imagePreview: {
    height: 200,
    width: "100%",
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

  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notesCounter: {
    fontSize: 11,
    fontWeight: "500",
    color: D.muted,
  },
  notesInput: {
    backgroundColor: D.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: D.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 110,
    fontSize: 14,
    color: D.text,
  },

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
  submitBtnDisabled: { opacity: 0.65 },
  submitText: { color: D.onPrimary, fontSize: 16, fontWeight: "700" },
});
