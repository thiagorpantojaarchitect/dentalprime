/**
 * Casca autenticada com navegacao por abas simples (sem dependencia extra de
 * navegacao). Alterna entre Prontuario e Perfil.
 */

import { useState } from "react";
import { SafeAreaView, Text, TouchableOpacity, View } from "react-native";

import { RecordScreen } from "./RecordScreen";
import { ProfileScreen } from "./ProfileScreen";
import { styles } from "../styles";

type Tab = "record" | "profile";

export function HomeScreen(): JSX.Element {
  const [tab, setTab] = useState<Tab>("record");

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "record" ? <RecordScreen /> : <ProfileScreen />}
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, tab === "record" ? styles.tabItemActive : null]}
          onPress={() => setTab("record")}
          accessibilityRole="button"
        >
          <Text style={tab === "record" ? styles.tabTextActive : styles.tabText}>
            Prontuário
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
