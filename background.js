// Background script para comunicação entre componentes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'elementSelected') {
    // Repassar mensagem do content script para o popup
    chrome.runtime.sendMessage(request);
  }
});

// Escutar mudanças de aba para resetar estado
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Limpar seleções quando mudar de aba
  chrome.tabs.sendMessage(activeInfo.tabId, { action: 'stopSelection' }).catch(() => {
    // Ignorar erros se a aba não tiver content script
  });
});

// Escutar instalação do plugin
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Cursor Element Selector instalado com sucesso!');
  }
});