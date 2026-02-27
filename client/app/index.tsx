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
} from "react-native";

export default function Index() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.page}>
          <View style={styles.card}>
            <View style={styles.logoCircle}>
              <Image
                source={require("../assets/images/dermatlas_icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.title}>Sign In</Text>

            <View style={styles.form}>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                placeholderTextColor={stylesVars.placeholder}
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={stylesVars.placeholder}
                secureTextEntry
                style={styles.input}
              />
              <Pressable
              style={styles.button}
              onPress={() => router.replace("/upload")}>
                <Text>Login</Text>
                </Pressable>

              <Pressable onPress={() => {}}>
                <Text style={styles.link}>Forgot Password?</Text>
              </Pressable>
            </View>

            <Text style={styles.footer}>
              For clinical use by authorized medical staff only.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stylesVars = {
  primary: "#118AB2",
  border: "#69B5D3",
  lightBlue: "#CFEFFC",
  bg: "#FFFFFF",
  pageBg: "#FFFFFF",
  placeholder: "#67AFCB",
  text: "#0B2B3A",
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: stylesVars.pageBg,
  },
  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: stylesVars.bg,
    borderWidth: 2,
    borderColor: stylesVars.border,
    borderRadius: 32,
    paddingTop: 36,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  logoCircle: {
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: stylesVars.lightBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 44,
    fontWeight: "800",
    color: stylesVars.primary,
    marginBottom: 22,
    letterSpacing: 0.3,
  },
  form: {
    width: "100%",
    gap: 16,
    alignItems: "center",
  },
  input: {
    width: "100%",
    borderWidth: 2,
    borderColor: stylesVars.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: stylesVars.text,
    backgroundColor: "#FFFFFF",
  },
  button: {
    width: "100%",
    backgroundColor: stylesVars.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  link: {
    color: stylesVars.primary,
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
    marginTop: 2,
  },
  footer: {
    marginTop: 18,
    backgroundColor: stylesVars.lightBlue,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    color: "#2C6A80",
    fontSize: 11,
    textAlign: "center",
    width: "100%",
  },
});