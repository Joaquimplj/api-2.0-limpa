const axios = require('axios');
const cheerio = require('cheerio');
const { distribuirImagens } = require('./distribuirImagens');
const { montarSequenciaHtml } = require('./montarSequenciaHtml');
const openai = require('openai');

class ImportService {
  async importFromShopify(url) {
    try {
      // Extrair o nome da loja e o ID do produto da URL
      const urlParts = url.split('/products/');
      const storeName = urlParts[0].replace('https://', '').replace('.myshopify.com', '');
      const productHandle = urlParts[1];

      // Fazer requisição para a API do Shopify
      const response = await axios.get(`https://${storeName}.myshopify.com/products/${productHandle}.json`);
      const product = response.data.product;

      return {
        title: product.title,
        body_html: product.body_html,
        vendor: product.vendor,
        product_type: product.product_type,
        variants: product.variants.map(variant => ({
          price: variant.price,
          sku: variant.sku,
          inventory_quantity: variant.inventory_quantity,
          option1: variant.option1,
          option2: variant.option2,
          option3: variant.option3
        })),
        images: product.images.map(image => ({
          src: image.src
        })),
        options: product.options.map(option => ({
          name: option.name,
          values: option.values
        }))
      };
    } catch (error) {
      console.error('Erro ao importar do Shopify:', error);
      throw new Error('Falha ao importar produto do Shopify');
    }
  }

  async importFromYano(url) {
    try {
      // Fazer requisição para a página do produto
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      // Extrair informações do produto
      const title = $('h1.product-title').text().trim();
      const description = $('div.product-description').html();
      const price = $('span.product-price').text().trim().replace('R$', '').trim();
      const images = [];
      
      $('img.product-image').each((i, element) => {
        images.push({
          src: $(element).attr('src')
        });
      });

      return {
        title: title,
        body_html: description,
        vendor: 'Yano',
        product_type: 'Importado do Yano',
        variants: [
          {
            price: price,
            sku: `YANO-${Date.now()}`,
            inventory_quantity: 1
          }
        ],
        images: images
      };
    } catch (error) {
      console.error('Erro ao importar do Yano:', error);
      throw new Error('Falha ao importar produto do Yano');
    }
  }

  async importFromNuvemShop(url) {
    try {
      // Fazer requisição para a página do produto
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      // Extrair informações do produto
      const title = $('h1.product-title').text().trim();
      const description = $('div.product-description').html();
      const price = $('span.product-price').text().trim().replace('R$', '').trim();
      const images = [];
      
      $('img.product-image').each((i, element) => {
        images.push({
          src: $(element).attr('src')
        });
      });

      return {
        title: title,
        body_html: description,
        vendor: 'Nuvem Shop',
        product_type: 'Importado do Nuvem Shop',
        variants: [
          {
            price: price,
            sku: `NUVEM-${Date.now()}`,
            inventory_quantity: 1
          }
        ],
        images: images
      };
    } catch (error) {
      console.error('Erro ao importar do Nuvem Shop:', error);
      throw new Error('Falha ao importar produto do Nuvem Shop');
    }
  }

  // --- NOVAS FUNÇÕES PARA COLEÇÕES ---
  async getProductUrlsFromShopifyCollection(collectionUrl) {
    try {
      let urls = [];
      let page = 1;
      let hasNext = true;
      const baseUrl = collectionUrl.split('?')[0];
      while (hasNext) {
        const url = `${baseUrl}?page=${page}`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        $('a[href*="/products/"]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.includes('/products/')) {
            let fullUrl = href.startsWith('http') ? href : `https://${baseUrl.split('/')[2]}${href}`;
            if (!fullUrl.includes('http')) fullUrl = 'https:' + fullUrl;
            if (!urls.includes(fullUrl)) urls.push(fullUrl);
          }
        });
        // Verifica se existe botão/link para próxima página
        hasNext = $('a[rel="next"], .pagination-next, .next, a:contains("Próxima")').length > 0;
        page++;
      }
      return urls;
    } catch (error) {
      console.error('Erro ao buscar produtos da coleção Shopify:', error);
      return [];
    }
  }

  async getProductUrlsFromYanoCollection(collectionUrl) {
    try {
      let urls = [];
      let page = 1;
      let hasNext = true;
      const baseUrl = collectionUrl.split('?')[0];
      while (hasNext) {
        const url = `${baseUrl}?page=${page}`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        $('a[href*="/produto/"]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.includes('/produto/')) {
            let fullUrl = href.startsWith('http') ? href : baseUrl.split('/')[0] + '//' + baseUrl.split('/')[2] + href;
            if (!urls.includes(fullUrl)) urls.push(fullUrl);
          }
        });
        hasNext = $('a[rel="next"], .pagination-next, .next, a:contains("Próxima")').length > 0;
        page++;
      }
      return urls;
    } catch (error) {
      console.error('Erro ao buscar produtos da coleção Yano:', error);
      return [];
    }
  }

  async getProductUrlsFromNuvemShopCollection(collectionUrl) {
    try {
      let urls = [];
      let page = 1;
      let hasNext = true;
      const baseUrl = collectionUrl.split('?')[0];
      while (hasNext) {
        const url = `${baseUrl}?page=${page}`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        $('a[href*="/produto/"]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && href.includes('/produto/')) {
            let fullUrl = href.startsWith('http') ? href : baseUrl.split('/')[0] + '//' + baseUrl.split('/')[2] + href;
            if (!urls.includes(fullUrl)) urls.push(fullUrl);
          }
        });
        hasNext = $('a[rel="next"], .pagination-next, .next, a:contains("Próxima")').length > 0;
        page++;
      }
      return urls;
    } catch (error) {
      console.error('Erro ao buscar produtos da coleção Nuvem Shop:', error);
      return [];
    }
  }

  async getCollectionInfoFromPage(collectionUrl) {
    try {
      const response = await axios.get(collectionUrl);
      const $ = cheerio.load(response.data);
      // Tenta pegar o nome da coleção do h1 ou title
      let name = $('h1').first().text().trim();
      if (!name) name = $('title').text().trim();
      // Tenta pegar uma descrição, se houver
      let description = $('meta[name="description"]').attr('content') || '';
      if (!description) description = $('p, .collection-description').first().text().trim();
      return { name, description };
    } catch (error) {
      console.error('Erro ao extrair info da coleção:', error);
      return { name: 'Coleção Importada', description: '' };
    }
  }

  async getAllCollectionsFromShopify(storeUrl) {
    try {
      // Exemplo: https://loja.myshopify.com/collections
      const collectionsPage = storeUrl.endsWith('/collections') ? storeUrl : storeUrl.replace(/\/$/, '') + '/collections';
      const response = await axios.get(collectionsPage);
      const $ = cheerio.load(response.data);
      const urls = [];
      $('a[href*="/collections/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/collections/') && !href.includes('/all')) {
          let fullUrl = href.startsWith('http') ? href : `https://${collectionsPage.split('/')[2]}${href}`;
          if (!fullUrl.includes('http')) fullUrl = 'https:' + fullUrl;
          if (!urls.includes(fullUrl)) urls.push(fullUrl);
        }
      });
      return urls;
    } catch (error) {
      console.error('Erro ao buscar coleções do Shopify:', error);
      return [];
    }
  }

  async getAllCollectionsFromYano(storeUrl) {
    try {
      // Exemplo: https://loja.yano.com.br/categorias
      const collectionsPage = storeUrl.endsWith('/categorias') ? storeUrl : storeUrl.replace(/\/$/, '') + '/categorias';
      const response = await axios.get(collectionsPage);
      const $ = cheerio.load(response.data);
      const urls = [];
      $('a[href*="/categoria/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/categoria/')) {
          let fullUrl = href.startsWith('http') ? href : storeUrl.split('/')[0] + '//' + storeUrl.split('/')[2] + href;
          if (!urls.includes(fullUrl)) urls.push(fullUrl);
        }
      });
      return urls;
    } catch (error) {
      console.error('Erro ao buscar coleções do Yano:', error);
      return [];
    }
  }

  async getAllCollectionsFromNuvemShop(storeUrl) {
    try {
      // Exemplo: https://loja.nuvemshop.com.br/colecoes
      const collectionsPage = storeUrl.endsWith('/colecoes') ? storeUrl : storeUrl.replace(/\/$/, '') + '/colecoes';
      const response = await axios.get(collectionsPage);
      const $ = cheerio.load(response.data);
      const urls = [];
      $('a[href*="/colecao/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/colecao/')) {
          let fullUrl = href.startsWith('http') ? href : storeUrl.split('/')[0] + '//' + storeUrl.split('/')[2] + href;
          if (!urls.includes(fullUrl)) urls.push(fullUrl);
        }
      });
      return urls;
    } catch (error) {
      console.error('Erro ao buscar coleções do Nuvem Shop:', error);
      return [];
    }
  }
}

module.exports = new ImportService();

async function gerarCopyComIA(produto, imagens, textosOriginais) {
    try {
        // Prompt da IA sem marcadores de imagem e reforçando para não mencionar imagens
        const prompt = `Reescreva os seguintes blocos de texto de forma mais persuasiva e profissional, mantendo o contexto de cada um:\n\n${textosOriginais.map((texto, index) => `BLOCO ${index + 1}:\n${texto}\n`).join('\n')}\n\nIMPORTANTE:\n- Mantenha a mesma estrutura de blocos\n- Não adicione ou remova blocos\n- Não mencione imagens, GIFs ou marcadores de imagem em nenhum bloco\n- Não use colchetes, tags ou instruções de imagem no texto\n- Foque em melhorar o texto e a persuasão\n- Use HTML apenas para formatação básica (negrito, itálico, etc)`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: "Você é um copywriter especialista em e-commerce, focado em criar descrições únicas e persuasivas que convertem."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        // Separa os blocos reescritos pela IA
        const textosReescritos = completion.choices[0].message.content
            .split(/BLOCO \d+:/g)
            .filter(texto => texto.trim())
            .map(texto => texto.trim());

        // Gera o HTML final distribuindo as imagens
        const htmlFinal = distribuirImagens(imagens, textosReescritos);

        // Retorna apenas o HTML final (sem marcadores)
        return htmlFinal;
    } catch (error) {
        console.error('Erro ao gerar copy com IA:', error);
        throw error;
    }
}

module.exports.gerarCopyComIA = gerarCopyComIA; 