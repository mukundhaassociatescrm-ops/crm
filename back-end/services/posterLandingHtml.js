const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const formatMultiline = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const isSlugLikeTitle = (title, slug) => {
  const normalized = String(title || '').trim().toLowerCase();
  const slugNorm = String(slug || '').trim().toLowerCase();
  if (!normalized) return true;
  if (slugNorm && normalized === slugNorm) return true;
  if (/^template-\d+$/i.test(normalized)) return true;
  return false;
};

const buildPosterLandingHtml = (poster) => {
  const rawTitle = String(poster.title || '').trim();
  const displayTitle = isSlugLikeTitle(rawTitle, poster.slug) ? '' : escapeHtml(rawTitle);
  const whatsappLabel = displayTitle || 'your poster';
  const category = escapeHtml(poster.category);
  const shortDescription = poster.shortDescription ? formatMultiline(poster.shortDescription) : '';
  const imageUrl = escapeHtml(poster.imageUrl);
  const imageAlt = displayTitle || 'Mukundha Associates poster';
  const pageTitle = displayTitle || 'Mukundha Associates';
  const whatsappLink = 'https://wa.me/919363069948?text=' + encodeURIComponent(`Hi Mukundha Associates, I viewed "${whatsappLabel}".`);
  const callLink = 'tel:+918508169948';
  const callLink2 = 'tel:+916379680872';

  const categoryBlock = category
    ? `<p class="hero-category">${category}</p>`
    : '';
  const titleBlock = displayTitle
    ? `<h1 class="hero-title">${displayTitle}</h1>`
    : '';
  const leadBlock = shortDescription
    ? `<p class="hero-lead">${shortDescription}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle} | Mukundha Associates</title>
  <meta name="description" content="${escapeHtml(poster.shortDescription || rawTitle || 'Mukundha Associates')}">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; overflow-x: hidden; overflow-y: auto; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(165deg, #ecfdf5 0%, #f8fafc 28%, #ffffff 72%);
      color: #0f172a;
      line-height: 1.5;
      padding: 8px 16px 32px;
    }
    .poster-container { width: min(100%, 1600px); margin: 0 auto; }
    .landing-top {
      display: flex; align-items: center; justify-content: center;
      gap: 10px; padding: 0 0 12px;
    }
    .brand-name {
      font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: #0f766e;
    }
    .landing-grid {
      display: grid; grid-template-columns: 70% 30%;
      gap: 24px; align-items: start;
    }
    .poster-column, .contact-column { min-width: 0; }
    .hero-category {
      display: inline-block; margin: 0 0 8px; padding: 4px 12px;
      border-radius: 999px; background: rgba(15, 118, 110, 0.1);
      color: #0f766e; font-size: 0.72rem; font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .hero-title {
      margin: 0 0 12px; color: #0f172a;
      font-size: clamp(1.15rem, 2.2vw, 1.75rem);
      line-height: 1.25; font-weight: 800;
    }
    .poster-frame {
      display: block; width: 100%; padding: 0; border: none;
      background: #fff; border-radius: 14px; cursor: zoom-in;
      box-shadow: 0 4px 6px rgba(15, 23, 42, 0.05), 0 16px 36px rgba(15, 23, 42, 0.1);
      overflow: hidden;
    }
    .poster-image {
      display: block; width: 100%; height: auto; border-radius: 14px;
    }
    .hero-lead {
      margin: 14px 0 0; color: #475569; font-size: 0.95rem; line-height: 1.55;
    }
    .contact-card {
      position: sticky; top: 16px;
      padding: 22px 18px; border-radius: 16px;
      background: #fff; border: 1px solid #e2e8f0;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }
    .contact-card__heading {
      margin: 0 0 6px; font-size: 1.15rem; font-weight: 800; color: #0f172a;
    }
    .contact-card__brand {
      margin: 0 0 16px; font-size: 0.88rem; font-weight: 700; color: #0f766e;
    }
    .service-list, .phone-list {
      list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 8px;
    }
    .service-list li {
      display: flex; align-items: flex-start; gap: 8px;
      font-size: 0.88rem; color: #334155; line-height: 1.4;
    }
    .service-list .check { color: #0f766e; font-weight: 700; }
    .phone-list { gap: 10px; }
    .phone-list li { display: flex; align-items: center; gap: 10px; font-size: 0.92rem; }
    .phone-list a {
      color: #0f172a; font-weight: 700; text-decoration: none;
    }
    .phone-list a:hover { color: #0f766e; text-decoration: underline; }
    .cta-actions { display: grid; gap: 10px; margin-bottom: 18px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 46px; padding: 11px 14px; border-radius: 12px;
      font-size: 0.9rem; font-weight: 800; text-decoration: none; color: #fff;
    }
    .btn-whatsapp { background: #25d366; box-shadow: 0 8px 20px rgba(37, 211, 102, 0.32); }
    .btn-call { background: #0f766e; box-shadow: 0 8px 20px rgba(15, 118, 110, 0.26); }
    .office-address { padding-top: 16px; border-top: 1px solid #e2e8f0; }
    .office-address h3 {
      margin: 0 0 8px; font-size: 0.82rem; font-weight: 800;
      letter-spacing: 0.04em; text-transform: uppercase; color: #64748b;
    }
    .office-address p { margin: 0; font-size: 0.85rem; line-height: 1.55; color: #334155; }
    .zoom-overlay {
      position: fixed; inset: 0; z-index: 200;
      display: none; align-items: center; justify-content: center;
      padding: 24px; background: rgba(15, 23, 42, 0.92); cursor: zoom-out;
    }
    .zoom-overlay.is-open { display: flex; }
    .zoom-close {
      position: absolute; top: 16px; right: 16px;
      width: 44px; height: 44px; border: none; border-radius: 50%;
      background: rgba(255, 255, 255, 0.15); color: #fff; font-size: 1.25rem; cursor: pointer;
    }
    .zoom-image {
      max-width: min(95vw, 1400px); max-height: 92vh;
      width: auto; height: auto; object-fit: contain; border-radius: 8px;
    }
    .fab-whatsapp {
      display: none; position: fixed; right: 12px; bottom: 12px; z-index: 100;
      align-items: center; justify-content: center;
      width: 52px; height: 52px; border-radius: 50%;
      background: #25d366; color: #fff; text-decoration: none;
      box-shadow: 0 10px 28px rgba(37, 211, 102, 0.45);
    }
    .fab-whatsapp svg { width: 26px; height: 26px; fill: currentColor; }
    @media (max-width: 900px) {
      body { padding: 8px 12px 88px; }
      .landing-grid { grid-template-columns: 1fr; gap: 20px; }
      .contact-card { position: static; width: 100%; }
      .fab-whatsapp { display: flex; }
    }
  </style>
</head>
<body>
  <main class="poster-container">
    <header class="landing-top">
      <span class="brand-name">Mukundha Associates</span>
    </header>

    <div class="landing-grid">
      <section class="poster-column">
        ${categoryBlock}
        ${titleBlock}
        <button type="button" class="poster-frame" id="poster-zoom-trigger" aria-label="View poster full size">
          <img class="poster-image" src="${imageUrl}" alt="${imageAlt}" loading="eager">
        </button>
        ${leadBlock}
      </section>

      <aside class="contact-column" aria-label="Contact information">
        <div class="contact-card">
          <h2 class="contact-card__heading">Need Assistance?</h2>
          <p class="contact-card__brand">Mukundha Associates</p>
          <ul class="service-list">
            <li><span class="check" aria-hidden="true">✓</span> Income Tax Return Filing</li>
            <li><span class="check" aria-hidden="true">✓</span> GST Filing</li>
            <li><span class="check" aria-hidden="true">✓</span> Accounting Services</li>
            <li><span class="check" aria-hidden="true">✓</span> Tax Consultation</li>
          </ul>
          <ul class="phone-list">
            <li><span aria-hidden="true">📞</span> <a href="${callLink}">85081 69948</a></li>
            <li><span aria-hidden="true">📞</span> <a href="${callLink2}">63796 80872</a></li>
            <li><span aria-hidden="true">💬</span> <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer">93630 69948</a></li>
          </ul>
          <div class="cta-actions">
            <a class="btn btn-whatsapp" href="${whatsappLink}" target="_blank" rel="noopener noreferrer">WhatsApp Now</a>
            <a class="btn btn-call" href="${callLink}">Call Now</a>
          </div>
          <div class="office-address">
            <h3>Office Address</h3>
            <p>TF7, C Block,<br>Ramani's Jewel Manor,<br>Coimbatore</p>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <div class="zoom-overlay" id="zoom-overlay" role="dialog" aria-modal="true" aria-label="Poster full size view">
    <button type="button" class="zoom-close" id="zoom-close" aria-label="Close">✕</button>
    <img class="zoom-image" src="${imageUrl}" alt="${imageAlt}">
  </div>

  <a class="fab-whatsapp" href="${whatsappLink}" target="_blank" rel="noopener noreferrer" title="Chat on WhatsApp" aria-label="Chat on WhatsApp">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  </a>
  <script>
    (function () {
      var trigger = document.getElementById('poster-zoom-trigger');
      var overlay = document.getElementById('zoom-overlay');
      var closeBtn = document.getElementById('zoom-close');
      if (!trigger || !overlay) return;
      function openZoom() { overlay.classList.add('is-open'); }
      function closeZoom() { overlay.classList.remove('is-open'); }
      trigger.addEventListener('click', openZoom);
      overlay.addEventListener('click', closeZoom);
      if (closeBtn) closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeZoom(); });
      overlay.querySelector('.zoom-image')?.addEventListener('click', function (e) { e.stopPropagation(); });
    })();
  </script>
</body>
</html>`;
};

const buildPosterNotFoundHtml = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poster not found | Mukundha Associates</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      text-align: center;
      padding: 48px 16px;
      color: #475569;
      background: linear-gradient(165deg, #ecfdf5 0%, #f8fafc 50%, #fff 100%);
      min-height: 100vh;
    }
    h1 { color: #0f172a; font-size: 1.5rem; }
    .brand { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #0f766e; margin-bottom: 16px; }
  </style>
</head>
<body>
  <p class="brand">Mukundha Associates</p>
  <h1>Poster not found</h1>
  <p>This link may be inactive or expired.</p>
</body>
</html>`;

module.exports = {
  buildPosterLandingHtml,
  buildPosterNotFoundHtml,
  escapeHtml,
  isSlugLikeTitle,
};
