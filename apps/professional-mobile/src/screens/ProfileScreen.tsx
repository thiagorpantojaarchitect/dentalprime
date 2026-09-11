/**
 * Perfil do profissional: mostra a sessao atual e permite sair.
 */

import { Text, TouchableOpacity, View } from "react-native";

import { useAuth } from "../auth-context";
import { styles } from "../styles";

export function ProfileScreen(): JSX.Element {
  const { session, logout } = useAuth();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.subtitle}>Dados da sua sessão.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>E-mail</Text>
        <Text style={styles.muted}>{session?.email ?? "-"}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Clínica (tenant)</Text>
        <Text style={styles.muted}>{session?.tenantId ?? "-"}</Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => void logout()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}
