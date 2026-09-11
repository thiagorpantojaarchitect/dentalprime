/**
 * Casca autenticada com navegacao por abas simples. Alterna entre Atendimento
 * e Perfil.
 */

import { useState } from "react";
import { SafeAreaView, Text, TouchableOpacity, View } from "react-native";

import { PatientScreen } from "./PatientScreen";
import { ProfileScreen } from "./ProfileScreen";
import { styles } from "../styles";

type Tab = "patient" | "profile";

export function HomeScreen(): JSX.Element {
  const [tab, setTab] = useState<Tab>("patient");

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "patient" ? <PatientScreen /> : <ProfileScreen />}
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, tab === "patient" ? styles.tabItemActive : null]}
          onPress={() => setTab("patient")}
          accessibilityRole="button"
        >
          <Text style={tab === "patient" ? styles.tabTextActive : styles.tabText}>
            Atendimento
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, tab === "profile" ? styles.tabItemActive : null]}
          onPress={() => setTab("profile")}
          accessibilityRole="button"
        >
          <Text style={tab === "profile" ? styles.tabTextActive : styles.tabText}>
            Perfil
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
