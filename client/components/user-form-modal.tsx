import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import type { AdminUser, CreateUserPayload, UpdateUserPayload } from "@/types/admin";
import type { UserRole } from "@/types/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (data: CreateUserPayload | UpdateUserPayload) => Promise<void>;
  existingUser?: AdminUser | null;
};

export function UserFormModal({ visible, onClose, onSave, existingUser }: Props) {
  const isEditing = !!existingUser;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("PCP");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setFullName(existingUser?.full_name ?? "");
      setEmail(existingUser?.email ?? "");
      setRole(existingUser?.role ?? "PCP");
      setPassword("");
      setShowPassword(false);
    }
  }, [visible, existingUser]);

  async function handleSave() {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert("Missing Fields", "Full name and email are required.");
      return;
    }
    if (!isEditing && !password.trim()) {
      Alert.alert("Missing Fields", "Password is required for new users.");
      return;
    }
    if (!email.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await onSave({ full_name: fullName.trim(), email: email.trim(), role } as UpdateUserPayload);
      } else {
        await onSave({
          full_name: fullName.trim(),
          email: email.trim(),
          role,
          password: password.trim(),
        } as CreateUserPayload);
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {isEditing ? "Edit User" : "Add New User"}
            </Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={D.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <FormField label="Full Name">
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Dr. Smith"
                placeholderTextColor={D.muted}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </FormField>

            <FormField label="Email">
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="e.g. dr.smith@hospital.com"
                placeholderTextColor={D.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </FormField>

            <FormField label="Role">
              <View style={styles.rolePicker}>
                {(["PCP", "PATIENT"] as UserRole[]).map((r) => (
                  <Pressable
                    key={r}
                    style={[
                      styles.roleOption,
                      role === r && styles.roleOptionSelected,
                    ]}
                    onPress={() => setRole(r)}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        role === r && styles.roleOptionTextSelected,
                      ]}
                    >
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </FormField>

            {!isEditing && (
              <FormField label="Initial Password">
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Set a temporary password"
                    placeholderTextColor={D.muted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <MaterialCommunityIcons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={D.muted}
                    />
                  </Pressable>
                </View>
              </FormField>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={D.onPrimary} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {isEditing ? "Save Changes" : "Create User"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: D.surface,
    borderRadius: 18,
    width: "100%",
    maxWidth: 460,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: D.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: D.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetBody: { maxHeight: 360 },
  sheetBodyContent: { padding: 20, gap: 16 },

  formField: { gap: 6 },
  formLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: D.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  input: {
    height: 44,
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: D.bg,
    color: D.text,
    fontSize: 15,
  },
  inputFlex: { flex: 1, borderWidth: 0 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 10,
    backgroundColor: D.bg,
    paddingHorizontal: 12,
  },
  eyeBtn: { padding: 4 },

  rolePicker: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: D.bg,
  },
  roleOptionSelected: { backgroundColor: D.primary },
  roleOptionText: { fontSize: 14, fontWeight: "600", color: D.muted },
  roleOptionTextSelected: { color: D.onPrimary },

  sheetFooter: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: D.border,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: D.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: D.muted },
  saveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 10,
    backgroundColor: D.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: D.onPrimary },
});
