// Content script para seleção de elementos
class ElementSelector {
  constructor() {
    this.isSelecting = false;
    this.selectedElement = null;
    this.overlay = null;
    this.highlightedElement = null;
    this.init();
  }

  init() {
    // Escutar mensagens do popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'startSelection') {
        this.startSelection();
        sendResponse({ success: true });
      } else if (request.action === 'stopSelection') {
        this.stopSelection();
        sendResponse({ success: true });
      } else if (request.action === 'getSelectedElement') {
        sendResponse({ element: this.selectedElement });
      }
    });
  }

  startSelection() {
    if (this.isSelecting) return;
    
    this.isSelecting = true;
    this.createOverlay();
    this.addEventListeners();
    document.body.style.cursor = 'crosshair';
  }

  stopSelection() {
    this.isSelecting = false;
    this.removeOverlay();
    this.removeEventListeners();
    document.body.style.cursor = 'default';
    this.clearHighlight();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'cursor-element-selector-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.1);
      z-index: 999999;
      pointer-events: none;
    `;
    document.body.appendChild(this.overlay);
  }

  removeOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  addEventListeners() {
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  removeEventListeners() {
    document.removeEventListener('mouseover', this.handleMouseOver.bind(this));
    document.removeEventListener('mouseout', this.handleMouseOut.bind(this));
    document.removeEventListener('click', this.handleClick.bind(this));
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleMouseOver(event) {
    if (!this.isSelecting) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    this.clearHighlight();
    this.highlightElement(event.target);
  }

  handleMouseOut(event) {
    if (!this.isSelecting) return;
    // Não limpar highlight aqui para manter a seleção visual
  }

  handleClick(event) {
    if (!this.isSelecting) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    this.selectElement(event.target);
    this.stopSelection();
  }

  handleKeyDown(event) {
    if (!this.isSelecting) return;
    
    if (event.key === 'Escape') {
      this.stopSelection();
    }
  }

  highlightElement(element) {
    if (element === document.body || element === document.documentElement) return;
    
    this.highlightedElement = element;
    element.classList.add('cursor-element-highlight');
    
    // Adicionar informações do elemento
    const rect = element.getBoundingClientRect();
    const info = this.getElementInfo(element);
    
    // Criar tooltip com informações do elemento
    this.createTooltip(rect, info);
  }

  clearHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('cursor-element-highlight');
      this.highlightedElement = null;
    }
    this.removeTooltip();
  }

  selectElement(element) {
    this.selectedElement = this.getElementInfo(element);
    this.clearHighlight();
  }

  getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      textContent: element.textContent?.substring(0, 100) || '',
      innerHTML: element.innerHTML?.substring(0, 200) || '',
      attributes: this.getElementAttributes(element),
      styles: {
        display: computedStyle.display,
        position: computedStyle.position,
        width: computedStyle.width,
        height: computedStyle.height,
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color,
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        margin: computedStyle.margin,
        padding: computedStyle.padding,
        border: computedStyle.border
      },
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      },
      xpath: this.getXPath(element),
      cssSelector: this.getCSSSelector(element)
    };
  }

  getElementAttributes(element) {
    const attributes = {};
    for (let attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }

  getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    const path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.previousElementSibling) {
        let index = 1;
        let sibling = element.previousElementSibling;
        while (sibling) {
          if (sibling.nodeName.toLowerCase() === selector) {
            index++;
          }
          sibling = sibling.previousElementSibling;
        }
        selector += `[${index}]`;
      }
      path.unshift(selector);
      element = element.parentElement;
    }
    return '/' + path.join('/');
  }

  getCSSSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    const path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.className) {
        selector += '.' + element.className.split(' ').join('.');
      }
      path.unshift(selector);
      element = element.parentElement;
    }
    return path.join(' > ');
  }

  createTooltip(rect, info) {
    this.removeTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.id = 'cursor-element-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      top: ${rect.top - 10}px;
      left: ${rect.left}px;
      background: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      z-index: 1000000;
      pointer-events: none;
      max-width: 300px;
      word-wrap: break-word;
    `;
    
    tooltip.innerHTML = `
      <div><strong>${info.tagName}</strong></div>
      ${info.id ? `<div>ID: ${info.id}</div>` : ''}
      ${info.className ? `<div>Class: ${info.className}</div>` : ''}
      <div>Click para selecionar</div>
    `;
    
    document.body.appendChild(tooltip);
  }

  removeTooltip() {
    const tooltip = document.getElementById('cursor-element-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }
}

// Inicializar o seletor quando o content script carrega
const elementSelector = new ElementSelector();