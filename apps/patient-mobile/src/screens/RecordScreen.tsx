/**
 * Meu prontuario: o paciente consulta seu cadastro e as evolucoes clinicas
 * (somente leitura). Consome patient-record via mobile-core.
 *
 * O backend associa o usuario autenticado ao cadastro do paciente; nenhum id
 * de prontuario e aceito pela interface ou pela API de autoatendimento.
 */

import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  ApiError,
  PatientSelfApi,
  type ClinicalRecord,
  type Patient,
} from "@dentalprime/mobile-core";

import { useAuth } from "../auth-context";
import { getServiceUrls } from "../config";
import { styles } from "../styles";

export function RecordScreen(): JSX.Element {
  const { clientFor } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<readonly ClinicalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const api = new PatientSelfApi(clientFor(getServiceUrls().patient));
      const [p, recs] = await Promise.all([
        api.getMyRecord(),
        api.listMyClinicalRecords(),
      ]);
      setPatient(p);
      setRecords(recs);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONSENT_REQUIRED") {
        setError("É necessário consentimento para acessar estes dados.");
      } else if (err instanceof ApiError && err.code === "NOT_FOUND") {
        setError("Prontuário não encontrado.");
      } else {
        setError("Não foi possível carregar seus dados.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>Meu prontuário</Text>
      <Text style={styles.subtitle}>Consulte seus dados e evoluções.</Text>

      <View style={styles.card}>
        <Text style={styles.muted}>
          O acesso é vinculado à sua conta pela clínica. Você verá somente o seu próprio
          prontuário.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, loading ? styles.buttonDisabled : null]}
          onPress={() => void load()}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {loading ? "Carregando..." : "Carregar meu prontuário"}
          </Text>
        </TouchableOpacity>
      </View>

      {patient ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{patient.fullName}</Text>
          <Text style={styles.muted}>CPF {patient.cpf}</Text>
        </View>
      ) : null}

      {records.map((r) => (
        <View key={r.recordKey} style={styles.card}>
          <Text style={styles.cardTitle}>{r.entryType ?? "Evolução"}</Text>
          <Text style={styles.muted}>{r.content ?? `Versão ${r.version}`}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
