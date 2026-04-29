# 🏐 Sistema de Gestão de Vôlei (Volei Management System)

Um sistema completo, moderno e em tempo real para gestão de grupos esportivos (rachas) de vôlei. Desenvolvido para automatizar a criação de equipes equilibradas, gerenciamento de listas de espera, placar ao vivo e manutenção de um ranking competitivo baseado no sistema Elo.

---

## ✨ Funcionalidades Principais

### 👥 Gestão de Múltiplos Grupos (SaaS)
- **Criação de Grupos:** Usuários podem criar e administrar seus próprios "rachas".
- **Sistema de Convites:** Vinculação de jogadores via e-mail para que possam acessar o painel do grupo.
- **Perfis Globais:** Ao vincular um e-mail, o nome e a foto do jogador são sincronizados automaticamente com o perfil global da conta.

### ⚖️ Sorteio Inteligente de Equipes
- **Algoritmo de Balanceamento:** Sorteia times nivelando rigorosamente a "Categoria" (nível técnico) de cada jogador para garantir partidas extremamente justas.
- **Estratégias de Sorteio:** Opções de balanceamento interno (dentro do próprio time) ou externo (nivelamento geral de todas as equipes).
- **Gestão de Lista de Espera:** Controle automático de "Rodadas de Fora" (Waitlist Rounds) para priorizar quem está há mais tempo sem jogar na hora de substituir equipes.

### ⏱️ Placar e Quadra Sincronizada
- **Quadra em Tempo Real:** A seleção dos times que estão jogando reflete em todos os dispositivos instantaneamente.
- **Trava de Segurança (Lock):** Quando os times são colocados no placar, o sistema bloqueia exclusões e manipulações na quadra para evitar conflitos (exclusivo para admins).
- **Placar Público:** Visitantes e jogadores podem visualizar as composições ativas e, se habilitado pelo admin, salvar os resultados oficiais ao final do set.

### 🏆 Ranking e Sistema de Elo
- **Cálculo de Pontuação:** Vitórias e derrotas afetam o Elo Rating do jogador com base em sequências de vitórias (streaks) e força dos times.
- **Histórico Completo:** Registro detalhado de todas as partidas, placares, composições de times e variação de Elo.
- **Cartinhas Dinâmicas:** Exibição do ranking em formato de "cards" no estilo Ultimate Team.

---

## 🔐 Controle de Acesso e Segurança (RBAC)

O sistema utiliza as Regras de Segurança do **Firebase Firestore** integradas com o estado do Front-end para garantir segurança total:
- **Group Admin:** Controle total sobre os jogadores, times, histórico e configurações do seu próprio grupo.
- **Player (Membro):** Pode visualizar o sorteio, ranking, histórico e operar o placar (se a opção `eloEnabled` estiver ativa).
- **Visitante:** Acesso apenas de visualização à tela pública.

---

## 🛠️ Tecnologias Utilizadas

- **Front-end:** HTML5, JavaScript (ES6 Modules), CSS3.
- **Estilização:** Tailwind CSS (via CDN) para uma interface responsiva, moderna e fluida.
- **Ícones:** Lucide Icons.
- **Back-end / Database:** Firebase (Authentication, Firestore, Storage).
- **Arquitetura:** Single Page Application (SPA) com manipulação dinâmica de DOM e listeners em tempo real (`onSnapshot`).

---

## 📂 Estrutura de Pastas

```text
/
├── index.html               # Estrutura principal da interface (SPA)
├── css/
│   └── style.css            # Estilos customizados e animações
├── js/
│   ├── main.js              # Ponto de entrada, inicialização e bindings globais
│   ├── ui.js                # Lógica de renderização de telas, modais e manipulação do DOM
│   ├── state.js             # Gerenciamento de estado global (Single Source of Truth)
│   ├── firebase.js          # Configuração, inicialização e referências do Firebase
│   ├── authService.js       # Serviços de autenticação e recuperação de senha
│   ├── controllers/
│   │   ├── adminController.js # CRUD de jogadores, upload de fotos e configurações
│   │   ├── draftController.js # Algoritmos de sorteio e manipulação de times/espera
│   │   └── matchController.js # Lógica do placar, cálculo de Elo e salvamento de partidas
│   └── services/
│       └── rankingService.js  # Matemática e algoritmos de balanceamento de times
```

---

## 🚀 Como Executar o Projeto

1. **Abrir o link no navegador**
   ```bash
   https://leolimadesigner.github.io/time-certo-volei/
   ```
2. **Configuração do Firebase:**
   - Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
   - Ative o **Authentication** (E-mail/Senha), **Firestore Database** e **Storage**.
   - Atualize o arquivo `js/config.js` (ou adicione as chaves no local adequado) com suas credenciais do Firebase.
3. **Regras do Firestore:**
   - Adicione as regras de segurança apropriadas no painel do Firestore para garantir o funcionamento do RBAC.
4. **Execução Local:**
   - Como o projeto utiliza ES6 Modules (`import`/`export`), ele precisa ser rodado através de um servidor local.
   - Você pode usar a extensão **Live Server** do VS Code ou ferramentas como `npx serve`.
   - Abra o `index.html` no navegador.

---

## 💡 Guia de Uso Básico

1. **Criar Conta e Grupo:** Faça o cadastro e crie o seu primeiro "Racha". Você será o Administrador automaticamente.
2. **Cadastrar Atletas:** Vá na aba "Painel" e cadastre os jogadores (manualmente ou vinculando e-mails). Defina o nível (Categoria) de cada um.
3. **Fazer o Sorteio:** Na aba "Sorteio", selecione os jogadores presentes, escolha a estratégia de balanceamento e clique em "SORTEAR EQUIPES".
4. **Jogar e Salvar:** Com as equipes formadas, vá para o "Placar". Selecione os times que vão para a quadra. Ao final da partida, clique em "Salvar Ranking" para atualizar o Elo e registrar no Histórico.
5. **Rotatividade:** Use a aba de Sorteio para substituir os times que perderam usando a opção "Substituir com a Lista de Espera".

---
*Desenvolvido com foco em performance, justiça nas partidas e usabilidade para gestores esportivos.*