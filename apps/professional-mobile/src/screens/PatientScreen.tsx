/**
 * Atendimento: o profissional busca um paciente, consulta as evolucoes e
 * registra uma nova evolucao clinica.
 *
 * Seguranca clinica: registros sao append-only (o backend versiona; correcoes
 * criam nova versao, nunca sobrescrevem). O app nao apaga registros.
 */

import { useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  ApiError,
  ClinicalApi,
  type ClinicalRecord,
  type Patient,
} from "@dentalprime/mobile-core";

import { useAuth } from "../auth-context";
import { getServiceUrls } from "../config";
import { styles } from "../styles";

function clinicalError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "CONSENT_REQUIRED") {
      return "Consentimento do paciente necessário para acessar este dado.";
    }
    if (err.code === "NOT_FOUND") return "Paciente não encontrado.";
    if (err.code === "FORBIDDEN") return "Sem permissão para esta ação.";
    if (err.code === "VALIDATION") return "Dados inválidos.";
  }
  return fallback;
}

export function PatientScreen(): JSX.Element {
  const { clientFor } = useAuth();

  const [patientId, setPatientId] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<readonly ClinicalRecord[]>([]);
  const [entryType, setEntryType] = useState("evolucao");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const api = (): ClinicalApi => {
    const urls = getServiceUrls();
    return new ClinicalApi(clientFor(urls.patient), clientFor(urls.scheduling));
  };

  const load = async (): Promise<void> => {
    const id = patientId.trim();
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const c = api();
      const [p, recs] = await Promise.all([c.getPatient(id), c.listClinicalRecords(id)]);
      setPatient(p);
      setRecords(recs);
    } catch (err) {
      setError(clinicalError(err, "Não foi possível carregar o paciente."));
    } finally {
      setBusy(false);
    }
  };

  const addRecord = async (): Promise<void> => {
    const id = patientId.trim();
    if (!id || !content.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api().addClinicalRecord(id, entryType, content);
      setContent("");
      const recs = await api().listClinicalRecords(id);
      setRecords(recs);
    } catch (err) {
      setError(clinicalError(err, "Não foi possível registrar a evolução."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>Atendimento</Text>
      <Text style={styles.subtitle}>Consulte e registre a evolução do paciente.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>ID do paciente</Text>
        <TextInput
          style={styles.input}
          value={patientId}
          onChangeText={setPatientId}
          autoCapitalize="none"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, busy ? styles.buttonDisabled : null]}
          onPress={() => void load()}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{busy ? "Carregando..." : "Carregar"}</Text>
        </TouchableOpacity>
      </View>

      {patient ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{patient.fullName}</Text>
            <Text style={styles.muted}>CPF {patient.cpf}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nova evolução</Text>
            <Text style={styles.label}>Tipo</Text>
            <TextInput
              style={styles.input}
              value={entryType}
              onChangeText={setEntryType}
            />
            <Text style={styles.label}>Conteúdo</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={content}
              onChangeText={setContent}
              multiline
            />
            <View style={styles.notice}>
              <Text style={styles.muted}>
                Registros clínicos são preservados. Correções criam uma nova versão sem
                apagar o histórico.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              onPress={() => void addRecord()}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Registrar</Text>
            </TouchableOpacity>
          </View>

          {records.map((r) => (
            <View key={r.recordKey} style={styles.card}>
              <Text style={styles.cardTitle}>{r.entryType ?? "Evolução"}</Text>
              <Text style={styles.muted}>{r.content ?? `Versão ${r.version}`}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
