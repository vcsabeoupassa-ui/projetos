CONTROLE DE PRODUÇÃO - CONFECÇÃO V3.1
=======================================

A V3.1 é uma evolução da V3, mantendo HTML + CSS + JavaScript + Node.js + banco.json.

NOVIDADES DA V3.1
-----------------
- Tela dedicada de RELATÓRIOS.
- Filtro por período.
- Filtro por costureira.
- Filtro por tipo.
- KPIs de lançamentos, quantidade e produção fracionada.
- Ranking por produção fracionada.
- Gráfico de produção por dia.
- Resumo por tipo.
- Resumo por subserviço.
- Resumo por costureira.
- Botão direto do painel para os relatórios.
- Mantidos backup JSON e exportação CSV.

REGRA PRINCIPAL
---------------
Quantidade executada × Fração do subserviço = Produção fracionada.

EXEMPLO
-------
Ana
JUJU
01.1 - Montagem - 0,11
Quantidade: 150

Produção fracionada:
150 × 0,11 = 16,50

ESTRUTURA
---------
Usuários
  └─ Administrador / Usuário

Costureiras
  └─ código + nome

Tipos
  └─ 01 JUJU
  └─ 02 MAYA
  └─ 03 MALU
  └─ novos tipos

Subserviços
  └─ 01.1, 01.2...
  └─ 02.1, 02.2...
  └─ relação explícita com tipo

Produção
  └─ data
  └─ costureira
  └─ tipo
  └─ subserviço
  └─ quantidade
  └─ fração utilizada
  └─ produção fracionada

Relatórios
  └─ período
  └─ costureira
  └─ tipo
  └─ diário
  └─ mensal/período
  └─ ranking
  └─ subserviço

Backup
  └─ JSON
  └─ CSV

EXECUÇÃO
--------
Requer Node.js 18+.

No terminal, dentro da pasta:
  node server.js

Abra:
  http://localhost:3000

LOGIN DE TESTE
--------------
Administrador:
  admin / 1234

Usuário:
  usuario / 1234

IMPORTANTE
----------
As credenciais são apenas para teste local. Antes de publicar o sistema:
- trocar senhas;
- implementar sessões/tokens;
- usar hash de senha;
- ativar HTTPS;
- considerar banco real para múltiplos usuários simultâneos;
- automatizar backups.
