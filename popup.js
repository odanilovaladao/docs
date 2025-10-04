// Popup script para interface do plugin
class PopupController {
  constructor() {
    this.selectedElement = null;
    this.isSelecting = false;
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadSettings();
    this.checkCurrentTab();
  }

  bindEvents() {
    document.getElementById('selectBtn').addEventListener('click', () => {
      this.startSelection();
    });

    document.getElementById('clearSelectionBtn').addEventListener('click', () => {
      this.clearSelection();
    });

    document.getElementById('sendPromptBtn').addEventListener('click', () => {
      this.sendPromptToCursor();
    });

    document.getElementById('cursorPort').addEventListener('change', (e) => {
      this.saveSettings({ cursorPort: e.target.value });
    });

    document.getElementById('promptTextarea').addEventListener('input', (e) => {
      this.updateSendButton();
    });
  }

  async checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.showStatus('selectionStatus', 'Nenhuma aba ativa encontrada', 'error');
        return;
      }

      // Verificar se é uma página web válida
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        this.showStatus('selectionStatus', 'Não é possível selecionar elementos nesta página', 'error');
        document.getElementById('selectBtn').disabled = true;
      }
    } catch (error) {
      console.error('Erro ao verificar aba atual:', error);
    }
  }

  async startSelection() {
    try {
      this.isSelecting = true;
      this.updateSelectButton();
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Injetar o content script se necessário
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Iniciar seleção
      await chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
      
      this.showStatus('selectionStatus', 'Clique em um elemento na página para selecioná-lo', 'info');
      
      // Escutar mensagens do content script
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'elementSelected') {
          this.handleElementSelected(request.element);
        }
      });

    } catch (error) {
      console.error('Erro ao iniciar seleção:', error);
      this.showStatus('selectionStatus', 'Erro ao iniciar seleção: ' + error.message, 'error');
      this.isSelecting = false;
      this.updateSelectButton();
    }
  }

  async handleElementSelected(element) {
    this.selectedElement = element;
    this.isSelecting = false;
    this.updateSelectButton();
    this.showElementInfo(element);
    this.showStatus('selectionStatus', 'Elemento selecionado com sucesso!', 'success');
    this.updateSendButton();
  }

  showElementInfo(element) {
    const elementInfo = document.getElementById('elementInfo');
    const elementSection = document.getElementById('elementSection');
    
    elementInfo.innerHTML = `
      <div><span class="tag">&lt;${element.tagName}&gt;</span></div>
      ${element.id ? `<div><span class="id">ID:</span> ${element.id}</div>` : ''}
      ${element.className ? `<div><span class="class">Class:</span> ${element.className}</div>` : ''}
      ${element.textContent ? `<div><strong>Texto:</strong> ${element.textContent}</div>` : ''}
      <div><strong>Seletor CSS:</strong> ${element.cssSelector}</div>
      <div><strong>XPath:</strong> ${element.xpath}</div>
    `;
    
    elementSection.classList.remove('hidden');
  }

  clearSelection() {
    this.selectedElement = null;
    document.getElementById('elementSection').classList.add('hidden');
    document.getElementById('selectionStatus').classList.add('hidden');
    this.updateSendButton();
  }

  updateSelectButton() {
    const btn = document.getElementById('selectBtn');
    if (this.isSelecting) {
      btn.innerHTML = '<span class="loading"></span> Selecionando...';
      btn.disabled = true;
    } else {
      btn.innerHTML = '🖱️ Selecionar Elemento na Página';
      btn.disabled = false;
    }
  }

  updateSendButton() {
    const btn = document.getElementById('sendPromptBtn');
    const textarea = document.getElementById('promptTextarea');
    const hasElement = this.selectedElement !== null;
    const hasPrompt = textarea.value.trim().length > 0;
    
    btn.disabled = !hasElement || !hasPrompt;
  }

  async sendPromptToCursor() {
    if (!this.selectedElement) {
      this.showStatus('sendStatus', 'Nenhum elemento selecionado', 'error');
      return;
    }

    const prompt = document.getElementById('promptTextarea').value.trim();
    if (!prompt) {
      this.showStatus('sendStatus', 'Digite um prompt antes de enviar', 'error');
      return;
    }

    try {
      const btn = document.getElementById('sendPromptBtn');
      btn.innerHTML = '<span class="loading"></span> Enviando...';
      btn.disabled = true;

      const cursorPort = document.getElementById('cursorPort').value || '3000';
      
      // Preparar dados para envio
      const data = {
        element: this.selectedElement,
        prompt: prompt,
        url: window.location.href,
        timestamp: new Date().toISOString()
      };

      // Tentar enviar para o Cursor IDE
      const response = await this.sendToCursorIDE(data, cursorPort);
      
      if (response.success) {
        this.showStatus('sendStatus', 'Prompt enviado com sucesso para o Cursor IDE!', 'success');
        // Limpar o prompt após envio bem-sucedido
        document.getElementById('promptTextarea').value = '';
        this.updateSendButton();
      } else {
        this.showStatus('sendStatus', 'Erro ao enviar para Cursor: ' + response.error, 'error');
      }

    } catch (error) {
      console.error('Erro ao enviar prompt:', error);
      this.showStatus('sendStatus', 'Erro ao enviar: ' + error.message, 'error');
    } finally {
      const btn = document.getElementById('sendPromptBtn');
      btn.innerHTML = '📤 Enviar para Cursor IDE';
      btn.disabled = false;
    }
  }

  async sendToCursorIDE(data, port) {
    try {
      // Tentar diferentes métodos de comunicação com o Cursor IDE
      
      // Método 1: WebSocket (se o Cursor estiver rodando um servidor)
      try {
        const ws = new WebSocket(`ws://localhost:${port}`);
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Timeout na conexão WebSocket'));
          }, 5000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.send(JSON.stringify({
              type: 'cursor-plugin-request',
              data: data
            }));
            ws.close();
            resolve({ success: true });
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Erro na conexão WebSocket'));
          };
        });
      } catch (wsError) {
        console.log('WebSocket não disponível, tentando método alternativo');
      }

      // Método 2: HTTP POST (se o Cursor estiver rodando um servidor HTTP)
      try {
        const response = await fetch(`http://localhost:${port}/cursor-plugin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          return { success: true };
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (httpError) {
        console.log('HTTP não disponível, usando método de fallback');
      }

      // Método 3: Fallback - salvar dados localmente e mostrar instruções
      await this.saveDataLocally(data);
      return { 
        success: true, 
        message: 'Dados salvos localmente. Veja as instruções abaixo.' 
      };

    } catch (error) {
      throw new Error('Não foi possível conectar com o Cursor IDE: ' + error.message);
    }
  }

  async saveDataLocally(data) {
    // Salvar dados no storage do Chrome para acesso posterior
    await chrome.storage.local.set({
      'cursor-plugin-data': data,
      'cursor-plugin-timestamp': Date.now()
    });
  }

  showStatus(elementId, message, type) {
    const statusElement = document.getElementById(elementId);
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.classList.remove('hidden');

    // Auto-hide após 5 segundos para mensagens de sucesso
    if (type === 'success') {
      setTimeout(() => {
        statusElement.classList.add('hidden');
      }, 5000);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['cursorPort']);
      if (result.cursorPort) {
        document.getElementById('cursorPort').value = result.cursorPort;
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  }

  async saveSettings(settings) {
    try {
      await chrome.storage.local.set(settings);
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
    }
  }
}

// Inicializar quando o popup carrega
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});