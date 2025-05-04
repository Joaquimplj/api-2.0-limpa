/**
 * Distribui as imagens de forma harmônica entre os blocos de texto
 * @param {string[]} imagens - Array com URLs das imagens
 * @param {string[]} blocos - Array com os blocos de texto
 * @returns {string} HTML final com imagens e textos intercalados
 */
function distribuirImagens(imagens, blocos) {
    let html = '';
    const totalBlocos = blocos.length;
    const totalImagens = imagens.length;

    // Calcula em quais blocos cada imagem deve aparecer
    const blocosComImagem = [];
    if (totalImagens === 1) {
        blocosComImagem.push(Math.floor(totalBlocos / 2)); // imagem no meio
    } else {
        for (let i = 0; i < totalImagens; i++) {
            blocosComImagem.push(Math.round(i * (totalBlocos - 1) / (totalImagens - 1)));
        }
    }

    let imagemIndex = 0;
    for (let i = 0; i < totalBlocos; i++) {
        if (i > 0) html += '<div class="espacador"></div>\n';
        html += `<div class="bloco-texto">${blocos[i]}</div>\n`;

        // Se este bloco é um dos escolhidos para receber imagem
        if (blocosComImagem.includes(i) && imagemIndex < totalImagens) {
            const imagem = imagens[imagemIndex];
            const isGif = imagem.toLowerCase().endsWith('.gif');
            html += `<div class="imagem-produto${isGif ? ' gif' : ''}">\n`;
            html += `    <img src="${imagem}" alt="Imagem do produto" loading="lazy" />\n`;
            html += `</div>\n`;
            imagemIndex++;
        }
    }
    return html;
}

module.exports = { distribuirImagens }; 