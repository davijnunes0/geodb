# GeoDB Cities - Aplicação de Consulta de Cidades

Aplicação web full-stack para consulta e visualização de informações sobre cidades do mundo através da GeoDB Cities API.

## Ferramentas Necessárias

- **Node.js** 18+ (com suporte nativo a `fetch`)
- **Docker** e Docker Compose
- **Git**
- Conta no [RapidAPI](https://rapidapi.com/) com API key da GeoDB Cities

## Configuração

### 1. Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=3000
RAPIDAPI_KEY=sua-chave-api-aqui
```

### 2. Como Obter a API Key (RAPIDAPI_KEY)

1. Acesse [RapidAPI GeoDB Cities](https://rapidapi.com/wirefreethought/api/geodb-cities)
2. Faça login ou crie uma conta
3. Clique em "Subscribe to Test" (plano gratuito disponível)
4. Copie sua API Key da seção "Code Snippets"
5. Cole a chave no arquivo `.env` como `RAPIDAPI_KEY`

### 3. Configurar a Porta

A porta é configurada através da variável de ambiente `PORT` no arquivo `.env`:

- **Padrão**: Se não especificado, usa a porta `3000`
- **Personalizada**: Defina `PORT=8080` (ou qualquer porta entre 1 e 65535)

Exemplo:
```env
PORT=3000
```

## Execução

### Com Docker (Recomendado)

**Windows (WSL):**
```bash
.\docker-rebuild.bat
```

**Linux/Mac:**
```bash
./docker-rebuild.sh
```

**Ou manualmente:**
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

A aplicação estará disponível em:
- `http://localhost:8080` (via Nginx)
- `http://localhost:3000` (direto Node.js)

### Sem Docker

```bash
cd app
npm install
node index.js
```

A aplicação estará disponível em `http://localhost:3000`

## Estrutura do Projeto

```
paradigmas/
├── app/                    # Aplicação Node.js
│   ├── controllers/        # Controladores MVC
│   ├── services/          # Lógica de negócio
│   ├── routes/            # Rotas Express
│   ├── views/             # Templates EJS
│   └── public/            # Arquivos estáticos
├── nginx/                 # Configuração Nginx
├── docker-compose.yml      # Orquestração Docker
├── Dockerfile             # Build Node.js
└── .env                   # Variáveis de ambiente (criar)
```

## Endpoints

- `GET /geo/cities` - Página principal
- `GET /api/cities` - API de cidades (JSON)
- `GET /api/health` - Health check

## Troubleshooting

**Erro: "Missing required environment variables"**
- Verifique se o arquivo `.env` existe na raiz
- Confirme que `PORT` e `RAPIDAPI_KEY` estão definidos

**Erro: "Invalid PORT value"**
- A porta deve ser um número entre 1 e 65535

**Porta já em uso:**
- Altere a porta no `.env` ou pare o processo que está usando a porta
