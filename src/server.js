const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Shopify = require('shopify-api-node');
const importService = require('./services/importService');
const { HfInference } = require('@huggingface/inference');
const cheerio = require('cheerio');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const removeAccents = (str) => str.normalize('NFD').replace(/[ -]+/g, '').replace(/[ 0-]/g, '').replace(/\p{Diacritic}/gu, '').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/gi, '').toLowerCase().trim();

const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;
const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models/gpt2';

// Nova integração DeepSeek
const DEEPSEEK_API_KEY = 'sk-88dbde7b2dab4e77bb8808855505b858';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Nova integração Hugging Face Paraphrase
const HF_PARAPHRASE_MODEL = 'Vamsi/T5_Paraphrase_Paws';
const HF_API_TOKEN = process.env.HF_API_TOKEN || 'hf_xxx'; // Substitua por seu token real
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_PARAPHRASE_MODEL}`;

const hf = new HfInference(HF_API_TOKEN);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Nova função para reescrever a copy usando OpenAI
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function gerarNovaCopyAntiga(copyAntiga) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um copywriter brasileiro especialista em e-commerce.' },
          { role: 'user', content: `Reescreva a descrição do produto abaixo de forma mais persuasiva, criativa e envolvente, como um copywriter profissional de e-commerce. Use linguagem de vendas, destaque benefícios e características, organize em parágrafos e listas quando fizer sentido, mas sem usar marcadores de template.\n\nDescrição original:\n${copyAntiga}` }
        ],
        max_tokens: 900,
        temperature: 0.8
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content.trim();
    }
    return copyAntiga;
  } catch (err) {
    console.error('Erro ao gerar nova copy (OpenAI):', err);
    return copyAntiga;
  }
}

async function reescreverDescricaoComOpenAI(descricaoOriginal) {
  try {
    // Chama a IA de verdade para reescrever o texto
    return await gerarNovaCopyAntiga(descricaoOriginal);
  } catch (error) {
    console.error('Erro ao reescrever descrição:', error);
    return descricaoOriginal;
  }
}

// Função para extrair todas as tags <img ...> do HTML
function extrairTagsImgDoHtml(html) {
  const $ = cheerio.load(html || '');
  const imagens = [];
  $('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src) {
      // Priorizar GIFs
      if (src.toLowerCase().endsWith('.gif')) {
        imagens.unshift(`<img src="${src}" alt="Imagem do produto" style="max-width:350px;margin:20px auto;display:block;" />`);
      } else {
        imagens.push(`<img src="${src}" alt="Imagem do produto" style="max-width:350px;margin:20px auto;display:block;" />`);
      }
    }
  });
  return imagens;
}

// Função para inserir imagens extraídas da descrição original após cada parágrafo da nova copy
function inserirImagensDaDescricaoOriginalNaCopy(novaCopy, htmlOriginal) {
  const imagens = extrairTagsImgDoHtml(htmlOriginal);
  if (imagens.length === 0) return novaCopy;
  // Divide a nova copy em parágrafos
  const partes = novaCopy.split(/(<\/p>)/i);
  let resultado = '';
  let imgIndex = 0;
  for (let i = 0; i < partes.length; i++) {
    resultado += partes[i];
    // Após cada </p>, insere uma imagem se houver disponível
    if (partes[i].toLowerCase() === '</p>' && imgIndex < imagens.length) {
      resultado += imagens[imgIndex];
      imgIndex++;
    }
  }
  // Se ainda restarem imagens, adiciona ao final
  while (imgIndex < imagens.length) {
    resultado += imagens[imgIndex];
    imgIndex++;
  }
  return resultado;
}

// Função para extrair imagens do HTML da descrição
function extrairImagensDoHtml(html) {
  const regex = /<img[^>]+src=["']([^"'>]+)["']/g;
  const urls = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    urls.push({ src: match[1] });
  }
  return urls;
}

// Função para extrair imagens do HTML original, marcando se é GIF
function extrairImagensMarcadas(html) {
  const $ = cheerio.load(html || '');
  const imagens = [];
  $('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src) {
      imagens.push({ src, isGif: src.toLowerCase().endsWith('.gif') });
    }
  });
  return imagens;
}

// Função para separar blocos de texto e imagens do HTML
function separarTextoEImagens(html) {
  // Divide em blocos: texto (parágrafos, listas, etc) e imagens
  const regex = /(<img[^>]+>)/gi;
  return html.split(regex).filter(Boolean);
}

// Função para reescrever apenas os blocos de texto com IA
async function reescreverBlocosComIA(blocos) {
  const novosBlocos = [];
  for (const bloco of blocos) {
    if (bloco.trim().startsWith('<img')) {
      novosBlocos.push(bloco); // Mantém imagem
    } else {
      // Só reescreve se for texto relevante
      const textoLimpo = bloco.replace(/<[^>]+>/g, '').trim();
      if (textoLimpo.length > 0) {
        const novoTexto = await reescreverDescricaoComOpenAI(bloco);
        novosBlocos.push(novoTexto);
      } else {
        novosBlocos.push(bloco); // Mantém blocos vazios ou só tags
      }
    }
  }
  return novosBlocos.join('');
}

// Endpoint para importar produtos
app.post('/api/import', async (req, res) => {
  try {
    const { shopifyStoreUrl, shopifyAccessToken, productUrl, sourcePlatform, gerarCopyIA } = req.body;

    if (!shopifyStoreUrl || !shopifyAccessToken || !productUrl || !sourcePlatform) {
      return res.status(400).json({ error: 'shopifyStoreUrl, shopifyAccessToken, productUrl e sourcePlatform são obrigatórios' });
    }

    // Inicializa o cliente Shopify com as credenciais fornecidas
    const shopify = new Shopify({
      shopName: shopifyStoreUrl,
      accessToken: shopifyAccessToken
    });

    let productData;
    // Importar produto baseado na plataforma de origem
    switch (sourcePlatform.toLowerCase()) {
      case 'shopify':
        productData = await importService.importFromShopify(productUrl);
        break;
      case 'yano':
        productData = await importService.importFromYano(productUrl);
        break;
      case 'nuvemshop':
        productData = await importService.importFromNuvemShop(productUrl);
        break;
      default:
        return res.status(400).json({ error: 'Plataforma não suportada' });
    }

    // 1. Cria o produto na Shopify com a descrição original
    const createdProduct = await shopify.product.create({
      ...productData,
      status: 'draft'
    });

    // Ajuste: só ativa IA se gerarCopyIA for true, 'true', 1, '1' ou 'on'
    const iaAtiva = gerarCopyIA === true || gerarCopyIA === 'true' || gerarCopyIA === 1 || gerarCopyIA === '1' || gerarCopyIA === 'on';
    if (iaAtiva) {
      // 2. Recupera a descrição salva na Shopify
      const produtoShopify = await shopify.product.get(createdProduct.id);
      const descricaoOriginal = produtoShopify.body_html;

      // --- NOVO: Extrair informações do HTML ---
      const $ = cheerio.load(descricaoOriginal || '');
      // Extrair benefícios (li dentro de ul)
      const beneficios = [];
      $('ul li').each((i, el) => {
        const txt = $(el).text().trim();
        if (txt) beneficios.push(txt);
      });
      // Extrair características técnicas (li ou tr/td)
      const caracteristicas = [];
      $('table tr').each((i, el) => {
        const tds = $(el).find('td');
        if (tds.length === 2) {
          caracteristicas.push(`${$(tds[0]).text().trim()}: ${$(tds[1]).text().trim()}`);
        }
      });
      $('ul li').each((i, el) => {
        const txt = $(el).text().trim();
        if (txt && txt.match(/:/)) caracteristicas.push(txt);
      });
      // Extrair usos sugeridos (palavras-chave)
      let usos = [];
      const usosMatch = descricaoOriginal.match(/(trilhas?|acampamentos?|ciclismo|pesca|corrida|caça|manutenção)/gi);
      if (usosMatch) usos = [...new Set(usosMatch.map(u => u.charAt(0).toUpperCase() + u.slice(1).toLowerCase()))];
      // Extrair diferencial (primeira frase forte)
      let diferencial = '';
      const p = $('p').first().text().trim();
      if (p.length > 0) diferencial = p;
      // Montar objeto de variáveis
      const productVars = {
        titulo_principal: productData.title || '',
        nome_produto: productData.title || '',
        beneficio_geral: 'iluminação eficiente e prática',
        usos_principais: usos.length ? usos.join(', ') : 'atividades ao ar livre',
        diferencial_mais_forte: diferencial || 'potência de iluminação com zoom e recarga USB',
        beneficio_1: beneficios[0] || 'Ilumina até 1000 metros',
        beneficio_2: beneficios[1] || 'Recarregável via USB',
        beneficio_3: beneficios[2] || 'À prova d\'água e resistente a quedas',
        beneficio_extra: beneficios[3] || 'Gira até 90º para maior campo de visão',
        material_ou_tecnologia: 'liga metálica reforçada',
        publico_alvo: 'adultos',
        outro_publico: 'crianças',
        uso_1: usos[0] || 'Trilhas',
        uso_2: usos[1] || 'Pesca',
        uso_3: usos[2] || 'Corrida noturna',
        uso_4: usos[3] || 'Manutenção',
        caracteristicas: caracteristicas.length ? caracteristicas.join(' | ') : ''
      };
      // Montar prompt personalizado
      const prompt = `
Você é um copywriter brasileiro especialista em e-commerce. Crie uma copy de venda para o produto abaixo, em HTML estruturado, seguindo a ordem dos blocos.

- Analise as informações do produto e identifique qual é o público-alvo ideal para ele.
- Identifique qual problema, dor ou desejo esse produto resolve para esse público.
- Construa a copy de forma envolvente, mostrando empatia com o público, citando situações reais e exemplos do dia a dia desse público.
- Explique claramente como o produto resolve o problema ou atende o desejo desse público.
- Destaque benefícios, diferenciais e microbenefícios do produto.
- Use perguntas retóricas, frases de impacto e chamadas para ação.
- Não insira marcadores de imagem, GIFs ou qualquer referência a imagens. Gere apenas o texto.
- Use HTML apenas para formatação (títulos, listas, parágrafos).

<h2>${productVars.titulo_principal}</h2>
<p>Abertura envolvente, com situação real, curiosidade e identificação.</p>
<h3>Por que escolher?</h3>
<ul>
  <li>✅ ${productVars.beneficio_1}</li>
  <li>✅ ${productVars.beneficio_2}</li>
  <li>✅ ${productVars.beneficio_3}</li>
  <li>✅ ${productVars.beneficio_extra}</li>
</ul>
<p>Exemplo de uso real, mostrando o produto em ação.</p>
<h3>Sobre o Produto</h3>
<p>Feita com ${productVars.material_ou_tecnologia}, combina leveza, resistência e design pensado para durar.</p>
<h3>Bateria de longa duração</h3>
<p>Descreva a autonomia, praticidade e vantagens da bateria.</p>
<h3>Versatilidade no uso</h3>
<p>Mostre situações variadas em que o produto pode ser útil, para diferentes públicos.</p>
<h3>Aproveite Agora</h3>
<p>Garanta já a sua com frete grátis e desconto exclusivo. Promoção válida por tempo limitado!</p>
<h3>Especificações</h3>
<ul>
  <li>Utilidades: ${productVars.usos_principais};</li>
  <li>Cor: Preto;</li>
  <li>Tipo de Material: Sólido;</li>
  <li>Tipo da Lâmpada: XHP50;</li>
  <li>Voltagem: 20W;</li>
  <li>Tipo de Bateria: Lithium ION;</li>
  <li>Alcance: Mais de 1000m;</li>
  <li>Tamanho: 6x4.3x4.3cm;</li>
  <li>Resistência: IP55 (contra poeira e contra jatos de água);</li>
</ul>
<h3>O que vai no pacote?</h3>
<ul>
  <li>1x Lanterna de Cabeça Zoom Super Potente - Recarregável USB</li>
  <li>1x Cabo USB</li>
</ul>

Use frases de transição, exemplos de uso e perguntas retóricas para dar ritmo e humanidade ao texto. Não altere os títulos dos blocos. Não deixe colchetes ou instruções no texto final.`;

      // 4. IA reescreve a copy baseada no prompt personalizado
      let novaDescricao;
      try {
        console.log('Reescrevendo descrição com IA (blocos obrigatórios)...');
        novaDescricao = await gerarNovaCopyAntiga(prompt);
        // Espalhar todas as imagens extraídas da descrição original na copy criada pela IA, sequencialmente
        novaDescricao = inserirImagensDaDescricaoOriginalNaCopy(novaDescricao, descricaoOriginal);
        // Pós-processamento: garantir blocos separados e títulos
        if (novaDescricao && !novaDescricao.match(/<h2>/i)) {
          novaDescricao = `<h2>${productVars.titulo_principal}</h2>\n` + novaDescricao;
        }
        if (novaDescricao && !novaDescricao.match(/<h3>Características/i) && productVars.caracteristicas) {
          novaDescricao += `<h3>Características Técnicas</h3><ul><li>${productVars.caracteristicas.split(' | ').join('</li><li>')}</li></ul>`;
        }
        console.log('Nova descrição gerada pela IA:', novaDescricao);
        // 5. Atualiza o produto na Shopify com a nova descrição
        await shopify.product.update(createdProduct.id, { body_html: novaDescricao });
        console.log('Produto atualizado na Shopify com descrição da IA.');
      } catch (err) {
        console.error('Erro ao reescrever e atualizar descrição com IA:', err);
      }
    }

    res.json({
      message: iaAtiva ? 'Produto importado, descrição reescrita com IA (mantendo imagens originais)' : 'Produto importado com sucesso',
      product: createdProduct
    });
  } catch (error) {
    console.error('Erro ao importar produto:', error);
    res.status(500).json({ error: error.message || 'Erro ao importar produto' });
  }
});

// Endpoint para importar coleção de produtos
app.post('/api/import-collection', async (req, res) => {
  try {
    const { shopifyStoreUrl, shopifyAccessToken, collectionUrl, sourcePlatform } = req.body;

    if (!shopifyStoreUrl || !shopifyAccessToken || !collectionUrl || !sourcePlatform) {
      return res.status(400).json({ error: 'shopifyStoreUrl, shopifyAccessToken, collectionUrl e sourcePlatform são obrigatórios' });
    }

    // Inicializa o cliente Shopify com as credenciais fornecidas
    const shopify = new Shopify({
      shopName: shopifyStoreUrl,
      accessToken: shopifyAccessToken
    });

    // Buscar todos os produtos da coleção
    let productUrls = [];
    switch (sourcePlatform.toLowerCase()) {
      case 'shopify':
        productUrls = await importService.getProductUrlsFromShopifyCollection(collectionUrl);
        break;
      case 'yano':
        productUrls = await importService.getProductUrlsFromYanoCollection(collectionUrl);
        break;
      case 'nuvemshop':
        productUrls = await importService.getProductUrlsFromNuvemShopCollection(collectionUrl);
        break;
      default:
        return res.status(400).json({ error: 'Plataforma não suportada' });
    }

    if (!productUrls.length) {
      return res.status(404).json({ error: 'Nenhum produto encontrado na coleção.' });
    }

    // Buscar nome e descrição da coleção de origem
    const { name: collectionName, description: collectionDescription } = await importService.getCollectionInfoFromPage(collectionUrl);

    // Verificar se a coleção já existe na Shopify
    let shopifyCollection = null;
    const collections = await shopify.customCollection.list({ title: collectionName });
    if (collections && collections.length > 0) {
      shopifyCollection = collections[0];
    } else {
      // Criar nova coleção
      shopifyCollection = await shopify.customCollection.create({
        title: collectionName,
        body_html: collectionDescription
      });
    }
    const collectionId = shopifyCollection.id;

    // Importar cada produto como rascunho e associar à coleção
    const results = [];
    // Buscar todos os produtos da loja uma vez para evitar múltiplas requisições
    const allProducts = await shopify.product.list({ limit: 250 });
    for (const url of productUrls) {
      try {
        let productData;
        switch (sourcePlatform.toLowerCase()) {
          case 'shopify':
            productData = await importService.importFromShopify(url);
            break;
          case 'yano':
            productData = await importService.importFromYano(url);
            break;
          case 'nuvemshop':
            productData = await importService.importFromNuvemShop(url);
            break;
        }
        // Normalizar título
        const newTitle = removeAccents(productData.title);
        const exists = allProducts.some(p => removeAccents(p.title) === newTitle);
        if (exists) {
          results.push({ url, success: false, error: 'Produto já existe na loja', duplicated: true });
          continue;
        }
        const createdProduct = await shopify.product.create({ ...productData, status: 'draft' });
        await shopify.collect.create({ collection_id: collectionId, product_id: createdProduct.id });
        results.push({ url, success: true, product: createdProduct });
      } catch (err) {
        console.error('Erro detalhado ao importar produto:', JSON.stringify(err, null, 2));
        results.push({ url, success: false, error: err.message, details: err });
      }
    }

    res.json({
      message: 'Coleção importada',
      results
    });
  } catch (error) {
    console.error('Erro ao importar coleção:', error);
    res.status(500).json({ error: error.message || 'Erro ao importar coleção' });
  }
});

// Endpoint para clonar loja inteira
app.post('/api/clone-store', async (req, res) => {
  try {
    const { shopifyStoreUrl, shopifyAccessToken, sourceStoreUrl, sourcePlatform } = req.body;
    if (!shopifyStoreUrl || !shopifyAccessToken || !sourceStoreUrl || !sourcePlatform) {
      return res.status(400).json({ error: 'shopifyStoreUrl, shopifyAccessToken, sourceStoreUrl e sourcePlatform são obrigatórios' });
    }
    const shopify = new Shopify({
      shopName: shopifyStoreUrl,
      accessToken: shopifyAccessToken
    });
    // Buscar todas as coleções da loja de origem
    let collectionUrls = [];
    switch (sourcePlatform.toLowerCase()) {
      case 'shopify':
        collectionUrls = await importService.getAllCollectionsFromShopify(sourceStoreUrl);
        break;
      case 'yano':
        collectionUrls = await importService.getAllCollectionsFromYano(sourceStoreUrl);
        break;
      case 'nuvemshop':
        collectionUrls = await importService.getAllCollectionsFromNuvemShop(sourceStoreUrl);
        break;
      default:
        return res.status(400).json({ error: 'Plataforma não suportada' });
    }
    if (!collectionUrls.length) {
      return res.status(404).json({ error: 'Nenhuma coleção encontrada na loja de origem.' });
    }
    // Para cada coleção, importar todos os produtos
    const results = [];
    for (const collectionUrl of collectionUrls) {
      try {
        // Reutiliza a lógica de importação de coleção
        const importResult = await importCollectionToShopify({
          shopify,
          collectionUrl,
          sourcePlatform,
          importService
        });
        results.push({ collectionUrl, ...importResult });
      } catch (err) {
        results.push({ collectionUrl, success: false, error: err.message });
      }
    }
    res.json({ message: 'Loja clonada', results });
  } catch (error) {
    console.error('Erro ao clonar loja:', error);
    res.status(500).json({ error: error.message || 'Erro ao clonar loja' });
  }
});

// Função utilitária para importar uma coleção para Shopify
async function importCollectionToShopify({ shopify, collectionUrl, sourcePlatform, importService }) {
  // Buscar URLs dos produtos da coleção
  let productUrls = [];
  switch (sourcePlatform.toLowerCase()) {
    case 'shopify':
      productUrls = await importService.getProductUrlsFromShopifyCollection(collectionUrl);
      break;
    case 'yano':
      productUrls = await importService.getProductUrlsFromYanoCollection(collectionUrl);
      break;
    case 'nuvemshop':
      productUrls = await importService.getProductUrlsFromNuvemShopCollection(collectionUrl);
      break;
  }
  if (!productUrls.length) {
    return { success: false, error: 'Nenhum produto encontrado na coleção.' };
  }
  // Buscar nome e descrição da coleção de origem
  const { name: collectionName, description: collectionDescription } = await importService.getCollectionInfoFromPage(collectionUrl);
  // Verificar/criar coleção na Shopify
  let shopifyCollection = null;
  const collections = await shopify.customCollection.list({ title: collectionName });
  if (collections && collections.length > 0) {
    shopifyCollection = collections[0];
  } else {
    shopifyCollection = await shopify.customCollection.create({
      title: collectionName,
      body_html: collectionDescription
    });
  }
  const collectionId = shopifyCollection.id;
  // Buscar todos os produtos da loja destino para evitar duplicatas
  const allProducts = await shopify.product.list({ limit: 250 });
  const removeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/gi, '').toLowerCase().trim();
  // Importar cada produto
  const results = [];
  for (const url of productUrls) {
    try {
      let productData;
      switch (sourcePlatform.toLowerCase()) {
        case 'shopify':
          productData = await importService.importFromShopify(url);
          break;
        case 'yano':
          productData = await importService.importFromYano(url);
          break;
        case 'nuvemshop':
          productData = await importService.importFromNuvemShop(url);
          break;
      }
      const newTitle = removeAccents(productData.title);
      const exists = allProducts.some(p => removeAccents(p.title) === newTitle);
      if (exists) {
        results.push({ url, success: false, error: 'Produto já existe na loja', duplicated: true });
        continue;
      }
      const createdProduct = await shopify.product.create({ ...productData, status: 'draft' });
      await shopify.collect.create({ collection_id: collectionId, product_id: createdProduct.id });
      results.push({ url, success: true, product: createdProduct });
    } catch (err) {
      results.push({ url, success: false, error: err.message, details: err });
    }
  }
  return { success: true, results };
}

// Endpoint para reescrever a descrição de um produto já existente na Shopify usando IA
app.post('/api/reescrever-copy', async (req, res) => {
  try {
    const { shopifyStoreUrl, shopifyAccessToken, productId } = req.body;
    
    if (!shopifyStoreUrl || !shopifyAccessToken || !productId) {
      return res.status(400).json({ error: 'shopifyStoreUrl, shopifyAccessToken e productId são obrigatórios' });
    }

    // Inicializa o cliente Shopify
    const shopify = new Shopify({
      shopName: shopifyStoreUrl,
      accessToken: shopifyAccessToken
    });

    // Buscar produto atual
    const product = await shopify.product.get(productId);
    const oldCopy = product.body_html;

    // Gerar nova copy com IA
    const newCopy = await reescreverDescricaoComOpenAI(oldCopy);

    // Atualizar produto na Shopify
    const updated = await shopify.product.update(productId, { 
      body_html: newCopy 
    });

    res.json({ 
      message: 'Descrição reescrita com IA!',
      product: updated
    });
  } catch (error) {
    console.error('Erro ao reescrever copy:', error);
    res.status(500).json({ error: error.message || 'Erro ao reescrever copy' });
  }
});

// Endpoint para listar produtos da Shopify
app.post('/api/listar-produtos', async (req, res) => {
  try {
    const { shopifyStoreUrl, shopifyAccessToken } = req.body;
    if (!shopifyStoreUrl || !shopifyAccessToken) {
      return res.status(400).json({ error: 'shopifyStoreUrl e shopifyAccessToken são obrigatórios' });
    }
    const shopify = new Shopify({
      shopName: shopifyStoreUrl,
      accessToken: shopifyAccessToken
    });
    const products = await shopify.product.list({ limit: 250 });
    res.json({ products });
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: error.message || 'Erro ao listar produtos' });
  }
});

// Endpoint para importação simples (sem IA)
app.post('/api/import-simples', async (req, res) => {
  try {
    const { shopifyStoreUrl, shopifyAccessToken, productUrl, sourcePlatform } = req.body;

    if (!shopifyStoreUrl || !shopifyAccessToken || !productUrl || !sourcePlatform) {
      return res.status(400).json({ error: 'shopifyStoreUrl, shopifyAccessToken, productUrl e sourcePlatform são obrigatórios' });
    }

    // Inicializa o cliente Shopify com as credenciais fornecidas
    const shopify = new Shopify({
      shopName: shopifyStoreUrl,
      accessToken: shopifyAccessToken
    });

    let productData;
    // Importar produto baseado na plataforma de origem
    switch (sourcePlatform.toLowerCase()) {
      case 'shopify':
        // Importa apenas os dados, sem manipulação de descrição ou imagens
        productData = await importService.importFromShopify(productUrl);
        break;
      case 'yano':
        productData = await importService.importFromYano(productUrl);
        break;
      case 'nuvemshop':
        productData = await importService.importFromNuvemShop(productUrl);
        break;
      default:
        return res.status(400).json({ error: 'Plataforma não suportada' });
    }

    // Cria o produto na Shopify exatamente como está, sem IA, sem ajuste de descrição/imagens
    console.log('Dados do produto a ser criado (simples):', productData);
    const createdProduct = await shopify.product.create({
      ...productData,
      status: 'draft'
    });
    console.log('Produto criado na Shopify (simples):', createdProduct);

    res.json({
      message: 'Produto importado com sucesso (sem IA, descrição e imagens originais)',
      product: createdProduct
    });
  } catch (error) {
    console.error('Erro ao importar produto (simples):', error);
    res.status(500).json({ error: error.message || 'Erro ao importar produto' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
}); 