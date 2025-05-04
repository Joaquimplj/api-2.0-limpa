# API de Importação de Produtos

Esta API permite importar produtos de outras plataformas (Shopify, Yano, Nuvem Shop) para sua loja Shopify.

## Configuração

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente:
Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:
```
PORT=3000
SHOPIFY_STORE_URL=sua-loja.myshopify.com
SHOPIFY_ACCESS_TOKEN=seu-token-de-acesso
```

3. Inicie o servidor:
```bash
npm start
```

## Uso da API

### Endpoint de Importação

**POST** `/api/import`

Corpo da requisição:
```json
{
  "productUrl": "URL_DO_PRODUTO",
  "sourcePlatform": "shopify|yano|nuvemshop"
}
```

Exemplo de resposta:
```json
{
  "message": "Produto importado com sucesso",
  "product": {
    // Dados do produto importado
  }
}
```

## Plataformas Suportadas

- Shopify
- Yano
- Nuvem Shop

## Requisitos

- Node.js 14+
- Token de acesso da API do Shopify
- URL da sua loja Shopify 