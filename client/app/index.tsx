import React, { useState } from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { login } from "@/services/auth-service";
import { DermAtlasColors as D } from "@/constants/theme";

export default function Index() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      router.replace("/upload");
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Login failed. Please try again.";
      setError(msg);
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
              {/* Logo */}
              <View style={styles.logoWrap}>
                <View style={styles.logoCircle}>
                  <Image
                    source={require("../assets/images/dermatlas_icon.png")}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.appName}>DermAtlas</Text>
                <Text style={styles.tagline}>Clinical Imaging Platform</Text>
              </View>

              {/* Form */}
              <View style={styles.form}>
                <Text style={styles.formTitle}>Sign In</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Username</Text>
                  <View
                    style={[
                      styles.inputWrap,
                      focusedField === "username" && styles.inputWrapFocused,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account-outline"
                      size={18}
                      color={
                        focusedField === "username" ? D.primary : D.muted
                      }
                    />
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      placeholder="Enter your username"
                      placeholderTextColor={D.muted}
                      autoCapitalize="none"
                      style={styles.input}
                      onFocus={() => setFocusedField("username")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View
                    style={[
                      styles.inputWrap,
                      focusedField === "password" && styles.inputWrapFocused,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={18}
                      color={
                        focusedField === "password" ? D.primary : D.muted
                      }
                    />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter your password"
                      placeholderTextColor={D.muted}
                      secureTextEntry
                      style={styles.input}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>

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
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Signing In…" : "Sign In"}
                  </Text>
                  {!loading ? (
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={20}
                      color={D.onPrimary}
                    />
                  ) : null}
                </Pressable>

                <Pressable onPress={() => {}} style={styles.forgotWrap}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </Pressable>
              </View>

              <View style={styles.footer}>
                <MaterialCommunityIcons
                  name="shield-check-outline"
                  size={14}
                  color={D.primary}
                />
                <Text style={styles.footerText}>
                  For clinical use by authorized medical staff only
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    maxWidth: 440,
    shadowColor: D.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },

  logoWrap: { alignItems: "center", marginBottom: 28 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: D.bg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: D.border,
  },
  logo: { width: 58, height: 58 },
  appName: {
    fontSize: 26,
    fontWeight: "800",
    color: D.primary,
    letterSpacing: 0.5,
  },
  tagline: { fontSize: 12, color: D.muted, marginTop: 3, fontWeight: "500" },

  form: { gap: 14 },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: D.text,
    marginBottom: 2,
  },

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
  inputWrapFocused: {
    borderColor: D.primary,
    backgroundColor: D.surface,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: D.text,
  },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: D.primary,
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
    marginTop: 4,
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

  forgotWrap: { alignItems: "center" },
  forgotText: { color: D.primary, fontSize: 13, fontWeight: "600" },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: D.bg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 22,
  },
  footerText: {
    color: D.primary,
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
});
