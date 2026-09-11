/**
 * Estilos compartilhados do app do profissional. Tema teal do produto.
 */

import { StyleSheet } from "react-native";

export const colors = {
  brand: "#0a7d78",
  brandDark: "#075e5a",
  bg: "#f5f7f8",
  text: "#1c2b2a",
  muted: "#5a6b6a",
  border: "#d6dedd",
  danger: "#b3261e",
  white: "#ffffff",
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: 20 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 6 },
  label: { fontSize: 13, color: colors.muted, marginBottom: 4 },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: colors.white,
    marginBottom: 12,
  },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
  notice: {
    backgroundColor: "#eef3f2",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  error: { color: colors.danger, fontSize: 14, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14 },
  tabBar: {
    flexDirection: "row",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.white,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabItemActive: { borderTopColor: colors.brand, borderTopWidth: 2 },
  tabText: { fontSize: 13, color: colors.muted },
  tabTextActive: { color: colors.brandDark, fontWeight: "600" },
});
