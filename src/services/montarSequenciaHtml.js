function montarSequenciaHtml(imagens, textos) {
    let html = '';
    for (let i = 0; i < Math.max(imagens.length, textos.length); i++) {
        if (imagens[i]) {
            html += `<div class="imagem-produto"><img src="${imagens[i]}" alt="Imagem do produto" loading="lazy" /></div>\n`;
        }
        if (textos[i]) {
            html += `<p>${textos[i]}</p>\n`;
        }
    }
    return html;
}

module.exports = { montarSequenciaHtml }; 