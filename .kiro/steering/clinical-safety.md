# Segurança Clínica — DentalPrime

O produto lida com informação clínica que apoia decisões de cuidado. Erros de
software podem impactar tratamento e segurança do paciente. Estas regras são
sempre aplicáveis.

## Princípios

- **O software apoia, não substitui, o julgamento clínico.** Nenhuma automação
  ou IA toma decisão clínica autônoma sobre um paciente.
- **Rastreabilidade.** Todo registro clínico tem autoria, data/hora e histórico
  de alterações. Registros clínicos não são apagados silenciosamente; correções
  preservam o histórico (versionamento/append, não sobrescrita destrutiva).
- **Integridade acima de conveniência.** Em caso de dúvida entre perder dado
  clínico e adicionar fricção, preservar o dado.

## IA do produto

- A camada de IA do produto (recepção por IA, triagem, sugestões) é **assistiva**
  e claramente identificada como IA ao usuário.
- Saídas de IA que possam influenciar cuidado exigem revisão humana antes de
  virar registro clínico.
- Prompts e respostas que envolvam dados de paciente seguem as regras de LGPD:
  minimização, base legal, sem vazamento a terceiros não autorizados.
- A IA do produto é distinta da IA de desenvolvimento (Kiro/Codex). A IA de
  desenvolvimento não acessa dados reais de pacientes.

## Regras para o agente (Kiro/Codex)

- Não implementar fluxos em que uma automação registre diagnóstico, prescrição
  ou plano de tratamento sem confirmação de um profissional habilitado.
- Preservar histórico clínico: preferir versionamento a exclusão/atualização
  destrutiva de registros clínicos.
- Tratar cálculos e regras clínicas (dosagens, alertas, intervalos) como
  críticos: exigem teste e revisão explícitos.
- Sinalizar qualquer funcionalidade que produza ou altere conteúdo clínico
  automaticamente, e confirmar o desenho com o usuário antes de implementar.
