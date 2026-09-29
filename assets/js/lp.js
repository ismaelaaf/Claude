/*
 * Rastreamento e formulário das landing pages.
 * Não precisa editar: a configuração fica em config.js.
 *
 * - Registra 1 acesso por sessão em cada LP (aba "Acessos" da planilha).
 * - Guarda UTMs / gclid / fbclid por 30 dias para atribuir o lead à origem certa.
 * - Valida e envia o formulário (aba "Leads" da planilha).
 */
(function () {
  'use strict';

  const CFG = window.LP_CONFIG || {};
  const LP = document.body.dataset.lp || 'sem-id';
  const UTMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const ATRIBUICAO_DIAS = 30;

  const tenta = (fn, padrao) => { try { return fn(); } catch (_) { return padrao; } };
  const local = {
    get: (k) => tenta(() => localStorage.getItem(k), null),
    set: (k, v) => tenta(() => localStorage.setItem(k, v)),
  };
  const sessao = {
    get: (k) => tenta(() => sessionStorage.getItem(k), null),
    set: (k, v) => tenta(() => sessionStorage.setItem(k, v)),
  };

  /* ---------- Identificação e atribuição ---------- */

  function visitante() {
    let id = local.get('lp_visitante');
    if (!id) {
      id = window.crypto && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 13)
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      local.set('lp_visitante', id);
    }
    return id;
  }

  function referenciaExterna() {
    return tenta(() => {
      const ref = document.referrer;
      return ref && new URL(ref).host !== location.host ? ref : '';
    }, '');
  }

  // Prioridade: parâmetros da URL > site de onde veio > última campanha salva (30 dias).
  function atribuicao() {
    const q = new URLSearchParams(location.search);
    const atual = {};
    UTMS.forEach((k) => { if (q.get(k)) atual[k] = q.get(k).slice(0, 200); });
    if (q.get('gclid')) atual.click_id = 'gclid:' + q.get('gclid').slice(0, 150);
    else if (q.get('fbclid')) atual.click_id = 'fbclid:' + q.get('fbclid').slice(0, 150);
    atual.referencia = referenciaExterna();

    if (Object.keys(atual).length > 1) {
      local.set('lp_atribuicao', JSON.stringify({ t: Date.now(), d: atual }));
      return atual;
    }
    if (atual.referencia) return atual;
    const salvo = tenta(() => JSON.parse(local.get('lp_atribuicao')), null);
    if (salvo && Date.now() - salvo.t < ATRIBUICAO_DIAS * 864e5) return salvo.d;
    return atual;
  }

  const ATRIB = atribuicao();
  const BASE = {
    lp: LP,
    visitante: visitante(),
    dispositivo: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Celular' : 'Computador',
    pagina: location.origin + location.pathname,
    utm_source: ATRIB.utm_source || '',
    utm_medium: ATRIB.utm_medium || '',
    utm_campaign: ATRIB.utm_campaign || '',
    utm_content: ATRIB.utm_content || '',
    utm_term: ATRIB.utm_term || '',
    click_id: ATRIB.click_id || '',
    referencia: ATRIB.referencia || '',
  };

  /* ---------- Envio para o Google Apps Script ---------- */

  function enviar(dados) {
    if (!CFG.endpoint) {
      console.info('[LP] endpoint vazio em config.js — envio simulado:', dados);
      return new Promise((ok) => setTimeout(ok, 500));
    }
    // no-cors: o Apps Script grava a linha; a resposta é opaca e não é necessária.
    return fetch(CFG.endpoint, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      body: new URLSearchParams(dados),
    });
  }

  if (!sessao.get('lp_acesso_' + LP)) {
    sessao.set('lp_acesso_' + LP, '1');
    enviar({ tipo: 'acesso', ...BASE }).catch(() => {});
  }

  /* ---------- Pixels opcionais ---------- */

  if (CFG.ga4) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.ga4);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CFG.ga4);
  }
  if (CFG.metaPixel) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', CFG.metaPixel);
    window.fbq('track', 'PageView');
  }

  function registraConversao() {
    if (window.fbq) window.fbq('track', 'Lead', { content_name: LP });
    if (window.gtag) window.gtag('event', 'generate_lead', { lp: LP });
    (window.dataLayer = window.dataLayer || []).push({ event: 'lead', lp: LP });
  }

  /* ---------- Formulário ---------- */

  const form = document.querySelector('[data-lead-form]');
  const sucesso = document.querySelector('[data-lead-sucesso]');
  const ctaMobile = document.querySelector('[data-cta-mobile]');

  function mascaraFone(valor) {
    let d = valor.replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function valida() {
    const erros = {};
    if (form.nome.value.trim().length < 2) erros.nome = 'Informe seu nome.';
    const fone = form.whatsapp.value.replace(/\D/g, '');
    if (fone.length < 10 || fone.length > 11) erros.whatsapp = 'Informe um WhatsApp com DDD.';
    const email = form.email.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = 'Confira o e-mail.';
    if (!form.consentimento.checked) erros.consentimento = 'Precisamos da sua autorização para falar com você.';
    return erros;
  }

  function mostraErros(erros) {
    form.querySelectorAll('[data-erro]').forEach((el) => {
      const campo = el.dataset.erro;
      el.textContent = erros[campo] || '';
      form[campo].setAttribute('aria-invalid', erros[campo] ? 'true' : 'false');
    });
  }

  function focaFormulario() {
    setTimeout(() => form && !form.hidden && form.nome.focus({ preventScroll: true }), 450);
  }

  if (form) {
    form.whatsapp.addEventListener('input', () => { form.whatsapp.value = mascaraFone(form.whatsapp.value); });

    document.querySelectorAll('a[href="#formulario"]').forEach((a) => a.addEventListener('click', focaFormulario));

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const aviso = form.querySelector('[data-form-status]');
      aviso.textContent = '';

      if (form.empresa.value) return concluido(); // armadilha para robôs

      const erros = valida();
      mostraErros(erros);
      const primeiro = Object.keys(erros)[0];
      if (primeiro) { form[primeiro].focus(); return; }

      const botao = form.querySelector('[type="submit"]');
      botao.disabled = true;
      botao.classList.add('is-loading');
      try {
        await enviar({
          tipo: 'lead',
          ...BASE,
          nome: form.nome.value.trim(),
          whatsapp: form.whatsapp.value,
          email: form.email.value.trim(),
          horario: form.horario.value,
          consentimento: 'Sim',
        });
        registraConversao();
        concluido();
      } catch (_) {
        aviso.textContent = 'Não conseguimos enviar agora. Confira sua conexão e tente de novo.';
        botao.disabled = false;
        botao.classList.remove('is-loading');
      }
    });
  }

  function concluido() {
    form.hidden = true;
    sucesso.hidden = false;
    sucesso.focus();
    if (ctaMobile) ctaMobile.hidden = true;
  }

  /* ---------- Botão fixo no celular: some quando o formulário está visível ---------- */

  const alvo = document.getElementById('formulario');
  if (ctaMobile && alvo && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => ctaMobile.classList.toggle('is-oculto', e.isIntersecting), {
      threshold: 0.2,
    }).observe(alvo);
  }
})();
