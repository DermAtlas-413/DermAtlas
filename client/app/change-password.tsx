import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import { changePassword } from "@/services/auth-service";

type StrengthLevel = "Weak" | "Fair" | "Strong" | "Very Strong";

function getPasswordStrength(password: string): { level: StrengthLevel; score: number } {
  if (password.length === 0) return { level: "Weak", score: 0 };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: "Weak", score: 1 };
  if (score === 2) return { level: "Fair", score: 2 };
  if (score === 3 || score === 4) return { level: "Strong", score: 3 };
  return { level: "Very Strong", score: 4 };
}

const STRENGTH_COLORS: Record<StrengthLevel, string> = {
  Weak: D.danger,
  Fair: D.warning,
  Strong: "#3BB87F",
  "Very Strong": D.success,
};

export default function ChangePassword() {
  const router = useRouter();

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(newPwd);

  function validate(): string | null {
    if (!currentPwd || !newPwd || !confirmPwd) return "All fields are required.";
    if (newPwd.length < 8) return "New password must be at least 8 characters.";
    if (newPwd === currentPwd) return "New password must differ from the current password.";
    if (newPwd !== confirmPwd) return "New password and confirmation do not match.";
    return null;
  }

  async function handleSubmit() {
    const error = validate();
    if (error) {
      Alert.alert("Cannot Update Password", error);
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPwd, newPwd);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Change Password</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <MaterialCommunityIcons name="check-circle" size={56} color={D.success} />
          </View>
          <Text style={styles.successTitle}>Password Updated</Text>
          <Text style={styles.successSubtitle}>
            Your password has been changed successfully.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryBtnText}>Back to Profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Change Password</Text>
          <Text style={styles.headerSubtitle}>Update your login credentials</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          <View style={styles.card}>
            <PasswordField
              label="Current Password"
              value={currentPwd}
              onChangeText={setCurrentPwd}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(!showCurrent)}
              placeholder="Enter current password"
            />

            <View style={styles.fieldDivider} />

            <PasswordField
              label="New Password"
              value={newPwd}
              onChangeText={setNewPwd}
              show={showNew}
              onToggleShow={() => setShowNew(!showNew)}
              placeholder="Enter new password"
            />
            {newPwd.length > 0 && (
              <View style={styles.strengthWrap}>
                <View style={styles.strengthBar}>
                  {[1, 2, 3, 4].map((seg) => (
                    <View
                      key={seg}
                      style={[
                        styles.strengthSegment,
                        seg <= strength.score && {
                          backgroundColor: STRENGTH_COLORS[strength.level],
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text
                  style={[
                    styles.strengthLabel,
                    { color: STRENGTH_COLORS[strength.level] },
                  ]}
                >
                  {strength.level}
                </Text>
              </View>
            )}

            <View style={styles.fieldDivider} />

            <PasswordField
              label="Confirm New Password"
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(!showConfirm)}
              placeholder="Re-enter new password"
            />
          </View>

          <View style={styles.requirements}>
            <Text style={styles.reqTitle}>Password requirements:</Text>
            <Requirement met={newPwd.length >= 8} text="At least 8 characters" />
            <Requirement met={/[A-Z]/.test(newPwd)} text="One uppercase letter" />
            <Requirement met={/[0-9]/.test(newPwd)} text="One number" />
            <Requirement
              met={/[^A-Za-z0-9]/.test(newPwd)}
              text="One special character"
            />
          </View>

          <Pressable
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={D.onPrimary} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Update Password</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggleShow,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          placeholder={placeholder}
          placeholderTextColor={D.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.eyeBtn} onPress={onToggleShow}>
          <MaterialCommunityIcons
            name={show ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={D.muted}
          />
        </Pressable>
      </View>
    </View>
  );
}

function Requirement({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.reqRow}>
      <MaterialCommunityIcons
        name={met ? "check-circle" : "circle-outline"}
        size={14}
        color={met ? D.success : D.muted}
      />
      <Text style={[styles.reqText, met && styles.reqTextMet]}>{text}</Text>
    </View>
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

  scroll: { flexGrow: 1 },
  page: {
    padding: 20,
    gap: 16,
    maxWidth: 480,
    alignSelf: "center",
    width: "100%",
  },

  card: {
    backgroundColor: D.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: D.border,
    paddingVertical: 4,
  },

  fieldDivider: { height: 1, backgroundColor: D.border, marginHorizontal: 16 },

  field: { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: D.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 10,
    backgroundColor: D.bg,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 42,
    color: D.text,
    fontSize: 15,
  },
  eyeBtn: {
    padding: 4,
  },

  strengthWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  strengthBar: { flex: 1, flexDirection: "row", gap: 4 },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: D.border,
  },
  strengthLabel: { fontSize: 12, fontWeight: "600", minWidth: 64 },

  requirements: {
    backgroundColor: D.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    padding: 14,
    gap: 8,
  },
  reqTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: D.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqText: { fontSize: 13, color: D.muted },
  reqTextMet: { color: D.text },

  primaryBtn: {
    backgroundColor: D.primary,
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText: {
    color: D.onPrimary,
    fontWeight: "700",
    fontSize: 15,
  },

  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: D.successBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: { fontSize: 22, fontWeight: "700", color: D.text },
  successSubtitle: {
    fontSize: 14,
    color: D.muted,
    textAlign: "center",
    maxWidth: 280,
  },
});
