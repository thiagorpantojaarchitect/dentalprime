/**
 * Tela de login do paciente. Autentica via identity-access. Mensagens de erro
 * genericas (nao revelar qual fator falhou).
 */

import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { ApiError } from "@dentalprime/mobile-core";

import { useAuth } from "../auth-context";
import { styles } from "../styles";

export function LoginScreen(): JSX.Element {
  const { login } = useAuth();
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      await login(tenantId.trim(), email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Credenciais invalidas."
          : "Nao foi possivel entrar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.centered}>
      <View style={[styles.card, { width: "100%" }]}>
        <Text style={styles.title}>DentalPrime</Text>
        <Text style={styles.subtitle}>Portal do paciente</Text>

        <Text style={styles.label}>Clínica (tenant)</Text>
        <TextInput
          style={styles.input}
          value={tenantId}
          onChangeText={setTenantId}
          autoCapitalize="none"
        />

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, submitting ? styles.buttonDisabled : null]}
          onPress={() => void onSubmit()}
          disabled={submitting}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{submitting ? "Entrando..." : "Entrar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
