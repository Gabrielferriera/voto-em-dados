# Abrir, verificar e publicar

## Visual Studio Code

1. Extraia o ZIP e abra `voto-em-dados.code-workspace` no VS Code.
2. Instale Python 3 para servir os arquivos localmente. Node.js é usado apenas nas verificações JavaScript.
3. Em **Terminal → Executar Tarefa**, selecione **Abrir site local**.
4. Acesse http://localhost:8000 no navegador. Não abra `index.html` diretamente: os módulos e dados usam HTTP.
5. Para encerrar o servidor, pressione Ctrl+C no terminal.

No Windows, o comando equivalente é `py -m http.server 8000 --bind 127.0.0.1 --directory dist`. Em Linux/macOS use `python3` no lugar de `py`.

## Organização

- `dist/`: site pronto, mapas, dados, fontes e licenças das bibliotecas.
- `scripts/`: coleta, reprodução, empacotamento e verificações.
- `docs/`: metodologia, evidências e instruções.
- `.vscode/tasks.json`: tarefas de execução e validação.
- `vercel.json`: publicação estática da pasta `dist`.

## Conferir antes de publicar

Execute **Verificar todos os dados** nas tarefas do VS Code, ou `py scripts/check_all.py` (Windows) / `python3 scripts/check_all.py` (Linux/macOS). São verificadas somas municipais e estaduais, geometrias, cálculos, contexto e locais de votação.

## GitHub

Crie o repositório `voto-em-dados` na conta desejada. Envie o conteúdo extraído do projeto, preservando a estrutura de pastas. Não envie somente o ZIP. A branch de produção prevista é `main`.

Os caches de coleta, credenciais e configurações privadas de hospedagem não fazem parte deste pacote. O `.gitignore` mantém esses arquivos fora de novos commits.

## Vercel

Importe o repositório GitHub. Selecione **Other** como framework e mantenha a raiz do projeto. A pasta de saída é `dist`; não há comando de compilação nem instalação. Não são necessárias variáveis de ambiente. Confira o status **Ready** e o endereço efetivamente retornado pela Vercel antes de divulgar.

A conexão Git pode pedir autorização para acessar o novo repositório. Conceda acesso apenas ao repositório necessário na interface oficial. Não compartilhe tokens ou senhas em mensagens.

## Atualizações

Edite e teste localmente; rode as verificações; envie os commits para `main`. Quando a integração Git estiver configurada, a Vercel publicará os novos commits de produção. Atualize também o ZIP de código com `python scripts/package_source.py` quando necessário.

## Limitações conhecidas

Ainda faltam renda, saneamento e contagem validada por horário. Não associe votos de candidatos ao horário de votação. Iluminação e desempenho WebGL precisam de conferência em dispositivo com GPU; o renderizador de compatibilidade foi testado. A exportação das imagens inclui fontes e metodologia.
