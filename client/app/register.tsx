import React, { useState } from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { registerNetwork } from "@/services/auth-service";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Register() {
  const [networkName, setNetworkName] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminNpi, setAdminNpi] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (networkName.trim().length < 2) return "Hospital name is too short.";
    if (adminFullName.trim().length < 1) return "Admin full name is required.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail))
      return "Enter a valid email address.";
    if (adminPassword.length < 8) return "Password must be at least 8 characters.";
    if (!/^\d{10}$/.test(adminNpi)) return "NPI must be exactly 10 digits.";
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await registerNetwork({
        network_name: networkName.trim(),
        admin_full_name: adminFullName.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminPassword,
        admin_npi: adminNpi,
      });
      router.replace("/upload");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.page}>
            <View style={styles.card}>
              <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={20}
                    color={D.primary}
                  />
                </Pressable>
                <Text style={styles.title}>Register your hospital</Text>
                <Text style={styles.subtitle}>
                  Create a new network and the first admin account.
                </Text>
              </View>

              <Field
                label="Hospital / clinic name"
                value={networkName}
                onChangeText={setNetworkName}
                placeholder="e.g. Rice General Hospital"
                fieldKey="network"
                focused={focused}
                setFocused={setFocused}
                icon="hospital-building"
              />

              <Field
                label="Admin full name"
                value={adminFullName}
                onChangeText={setAdminFullName}
                placeholder="Dr. Jane Doe"
                fieldKey="name"
                focused={focused}
                setFocused={setFocused}
                icon="account-outline"
              />

              <Field
                label="Admin email"
                value={adminEmail}
                onChangeText={setAdminEmail}
                placeholder="admin@hospital.org"
                fieldKey="email"
                focused={focused}
                setFocused={setFocused}
                icon="email-outline"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Field
                label="NPI number (10 digits)"
                value={adminNpi}
                onChangeText={(v) => setAdminNpi(v.replace(/\D/g, "").slice(0, 10))}
                placeholder="1234567890"
                fieldKey="npi"
                focused={focused}
                setFocused={setFocused}
                icon="card-account-details-outline"
                keyboardType="number-pad"
              />

              <Field
                label="Admin password"
                value={adminPassword}
                onChangeText={setAdminPassword}
                placeholder="At least 8 characters"
                fieldKey="password"
                focused={focused}
                setFocused={setFocused}
                icon="lock-outline"
                secureTextEntry
              />

              {error ? (
                <View style={styles.errorBanner}>
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={16}
                    color={D.danger}
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  loading && styles.buttonDisabled,
                  pressed && !loading && styles.buttonPressed,
                ]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? "Creating…" : "Create network"}
                </Text>
                {!loading ? (
                  <MaterialCommunityIcons
                    name="arrow-right"
                    size={20}
                    color={D.onPrimary}
                  />
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => router.replace("/")}
                style={styles.altLinkWrap}
              >
                <Text style={styles.altLinkText}>
                  Already have an account? Sign in
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  fieldKey,
  focused,
  setFocused,
  icon,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  fieldKey: string;
  focused: string | null;
  setFocused: (k: string | null) => void;
  icon: IconName;
  keyboardType?: "default" | "email-address" | "number-pad";
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const isFocused = focused === fieldKey;
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          isFocused && styles.inputWrapFocused,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={isFocused ? D.primary : D.muted}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={D.muted}
          style={styles.input}
          onFocus={() => setFocused(fieldKey)}
          onBlur={() => setFocused(null)}
          keyboardType={keyboardType ?? "default"}
          secureTextEntry={!!secureTextEntry}
          autoCapitalize={autoCapitalize ?? "sentences"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: D.bg },
  scroll: { flexGrow: 1 },
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  card: {
    backgroundColor: D.surface,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 460,
    gap: 14,
    shadowColor: D.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  header: { gap: 6, marginBottom: 4 },
  backBtn: {
    alignSelf: "flex-start",
    padding: 6,
    marginBottom: 6,
  },
  title: { fontSize: 22, fontWeight: "800", color: D.primary },
  subtitle: { fontSize: 13, color: D.muted, fontWeight: "500" },

  fieldGroup: { gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: D.text },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: D.bg,
    gap: 10,
  },
  inputWrapFocused: { borderColor: D.primary, backgroundColor: D.surface },
  input: { flex: 1, fontSize: 15, color: D.text },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: D.primary,
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
    marginTop: 6,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: D.onPrimary, fontSize: 16, fontWeight: "700" },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.dangerBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: D.danger,
  },
  errorText: { color: D.danger, fontSize: 13, fontWeight: "600", flex: 1 },

  altLinkWrap: { alignItems: "center", marginTop: 4 },
  altLinkText: { color: D.primary, fontSize: 13, fontWeight: "600" },
});
