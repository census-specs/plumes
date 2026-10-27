// Éditeur de texte riche (contenteditable), sans dépendance externe : fonctionne hors ligne.
const Editeur = (() => {
  let el, boutons, palette, barreTableau;

  const COULEURS_TEXTE = ['#c0392b', '#d68910', '#2f6f5e', '#2563a8', '#7d3c98', '#6b7670'];
  const COULEURS_FOND = ['rgba(255,213,0,.4)', 'rgba(46,204,113,.35)', 'rgba(52,152,219,.35)',
                         'rgba(231,76,60,.3)', 'rgba(155,89,182,.3)'];

  // ---------- Utilitaires ----------
  const echap = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function declencher() { el.dispatchEvent(new Event('input', { bubbles: true })); }

  function exec(cmd, valeur = null) {
    document.execCommand(cmd, false, valeur);
    declencher();
  }

  function dansEditeur() {
    const s = getSelection();
    return s.rangeCount && el.contains(s.anchorNode);
  }

  function focusEditeur() { if (!dansEditeur()) el.focus(); }

  function parent(selecteur) {
    const s = getSelection();
    let n = s.rangeCount ? s.anchorNode : null;
    if (!n) return null;
    if (n.nodeType === 3) n = n.parentElement;
    const r = n && n.closest(selecteur);
    return r && el.contains(r) && r !== el ? r : null;
  }

  // Nettoyage : retire scripts et attributs dangereux (données importées ou synchronisées).
  function nettoyer(html) {
    const doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form').forEach((n) => n.remove());
    doc.body.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => {
        const nom = a.name.toLowerCase();
        if (nom.startsWith('on') ||
            ((nom === 'href' || nom === 'src') && /^\s*javascript:/i.test(a.value))) {
          n.removeAttribute(a.name);
        }
      });
    });
    return doc.body.innerHTML;
  }

  // Les notes de l'étape 1 sont du texte brut : on les convertit en HTML.
  function enHtml(contenu) {
    contenu = contenu || '';
    if (/<[a-z][\s\S]*>/i.test(contenu)) return contenu;
    return contenu.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  }

  function texte(contenu) {
    const d = document.createElement('div');
    d.innerHTML = nettoyer(enHtml(contenu));
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // ---------- Commandes ----------
  function bloc(balise) {
    focusEditeur();
    const actuel = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    exec('formatBlock', '<' + (actuel === balise ? 'p' : balise) + '>');
  }

  function listeCases() {
    focusEditeur();
    const ul = parent('ul');
    if (ul && !ul.classList.contains('checklist')) { ul.classList.add('checklist'); declencher(); return; }
    if (ul) { exec('insertUnorderedList'); return; }
    exec('insertUnorderedList');
    const nouvelle = parent('ul');
    if (nouvelle) { nouvelle.classList.add('checklist'); declencher(); }
  }

  function lien() {
    focusEditeur();
    const s = getSelection();
    const plage = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    let url = prompt('Adresse du lien :');
    if (!url) return;
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
    if (plage) { s.removeAllRanges(); s.addRange(plage); }
    if (s.isCollapsed) {
      exec('insertHTML', `<a href="${echap(url)}">${echap(url)}</a>`);
    } else {
      exec('createLink', url);
    }
  }

  function couleur(type, valeur) {
    focusEditeur();
    document.execCommand('styleWithCSS', false, true);
    if (type === 'texte') {
      exec('foreColor', valeur || getComputedStyle(el).color);
    } else {
      exec('hiliteColor', valeur || 'transparent');
    }
    document.execCommand('styleWithCSS', false, false);
    palette.hidden = true;
  }

  // ---------- Tableaux ----------
  function insererTableau() {
    focusEditeur();
    let h = '<table><tbody>';
    for (let r = 0; r < 3; r++) {
      h += '<tr>';
      for (let c = 0; c < 3; c++) h += '<td><br></td>';
      h += '</tr>';
    }
    h += '</tbody></table><p><br></p>';
    exec('insertHTML', h);
  }

  function nouvelleCellule() {
    const td = document.createElement('td');
    td.innerHTML = '<br>';
    return td;
  }

  const actionsTableau = {
    ligne_plus() {
      const c = parent('td,th'); if (!c) return;
      const l = c.parentElement, n = l.cloneNode(false);
      for (let i = 0; i < l.cells.length; i++) n.appendChild(nouvelleCellule());
      l.after(n);
    },
    col_plus() {
      const c = parent('td,th'); if (!c) return;
      const i = c.cellIndex;
      c.closest('table').querySelectorAll('tr').forEach((l) => {
        if (l.cells[i]) l.cells[i].after(nouvelleCellule()); else l.appendChild(nouvelleCellule());
      });
    },
    ligne_moins() {
      const c = parent('td,th'); if (!c) return;
      const l = c.parentElement, t = l.closest('table');
      l.remove();
      if (!t.rows.length) t.remove();
    },
    col_moins() {
      const c = parent('td,th'); if (!c) return;
      const i = c.cellIndex, t = c.closest('table');
      t.querySelectorAll('tr').forEach((l) => { if (l.cells[i]) l.deleteCell(i); });
      if (!t.rows[0] || !t.rows[0].cells.length) t.remove();
    },
    supprimer() {
      const c = parent('td,th'); if (c) c.closest('table').remove();
    }
  };

  // ---------- Construction de la barre d'outils ----------
  const BOUTONS = [
    ['annuler', '↶', 'Annuler', () => exec('undo')],
    ['refaire', '↷', 'Rétablir', () => exec('redo')],
    ['h1', 'H1', 'Titre', () => bloc('h1')],
    ['h2', 'H2', 'Sous-titre', () => bloc('h2')],
    ['gras', '<b>G</b>', 'Gras', () => exec('bold')],
    ['italique', '<i>I</i>', 'Italique', () => exec('italic')],
    ['souligne', '<u>S</u>', 'Souligné', () => exec('underline')],
    ['barre', '<s>B</s>', 'Barré', () => exec('strikeThrough')],
    ['couleurs', 'A', 'Couleurs', () => { palette.hidden = !palette.hidden; }],
    ['puces', '•', 'Liste à puces', () => { focusEditeur(); exec('insertUnorderedList'); }],
    ['numeros', '1.', 'Liste numérotée', () => { focusEditeur(); exec('insertOrderedList'); }],
    ['cases', '☑', 'Liste à cocher', listeCases],
    ['citation', '❝', 'Citation', () => bloc('blockquote')],
    ['code', '&lt;/&gt;', 'Code', () => bloc('pre')],
    ['lien', 'Lien', 'Lien', lien],
    ['tableau', '▦', 'Tableau', insererTableau],
    ['trait', '―', 'Séparateur', () => { focusEditeur(); exec('insertHorizontalRule'); }]
  ];

  function construire() {
    boutons.innerHTML = BOUTONS.map(([id, label, titre]) =>
      `<button type="button" data-id="${id}" aria-label="${titre}" title="${titre}">${label}</button>`).join('');

    const pastilles = (type, liste) => liste.map((c) =>
      `<button type="button" class="pastille" data-type="${type}" data-val="${c}" style="background:${c}"></button>`).join('') +
      `<button type="button" class="pastille aucune" data-type="${type}" data-val="">✕</button>`;
    palette.innerHTML =
      `<span>Texte</span>${pastilles('texte', COULEURS_TEXTE)}` +
      `<span>Fond</span>${pastilles('fond', COULEURS_FOND)}`;

    barreTableau.innerHTML = `
      <button type="button" data-act="ligne_plus">+ Ligne</button>
      <button type="button" data-act="col_plus">+ Colonne</button>
      <button type="button" data-act="ligne_moins">− Ligne</button>
      <button type="button" data-act="col_moins">− Colonne</button>
      <button type="button" data-act="supprimer" class="danger">Suppr. tableau</button>`;
  }

  // ---------- Initialisation ----------
  function init() {
    el = document.querySelector('#note-contenu');
    boutons = document.querySelector('#outils-boutons');
    palette = document.querySelector('#palette');
    barreTableau = document.querySelector('#outils-tableau');
    construire();

    document.execCommand('defaultParagraphSeparator', false, 'p');

    // Garde le clavier ouvert et la sélection quand on touche la barre d'outils.
    document.querySelector('#outils').addEventListener('mousedown', (e) => e.preventDefault());

    boutons.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const def = BOUTONS.find((x) => x[0] === b.dataset.id);
      if (def) def[3]();
    });

    palette.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) couleur(b.dataset.type, b.dataset.val);
    });

    barreTableau.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      actionsTableau[b.dataset.act]();
      declencher();
    });

    // Cases à cocher : toucher la case à gauche de la ligne.
    el.addEventListener('click', (e) => {
      const li = e.target.closest && e.target.closest('li');
      if (!li || !el.contains(li) || !li.parentElement.classList.contains('checklist')) return;
      if (e.clientX - li.getBoundingClientRect().left > 34) return;
      e.preventDefault();
      li.toggleAttribute('data-fait');
      declencher();
    });

    el.addEventListener('input', (e) => {
      // Une nouvelle ligne de liste à cocher repart décochée.
      if (e.inputType === 'insertParagraph') {
        const li = parent('li');
        if (li) li.removeAttribute('data-fait');
      }
      // Permet l'affichage du texte d'invite quand l'éditeur est vide.
      if (!el.textContent.trim() && !el.querySelector('img,table,li,hr')) el.innerHTML = '';
    });

    // Collage en texte brut pour éviter le code parasite venu d'autres sites.
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });

    // La barre « tableau » n'apparaît que lorsque le curseur est dans un tableau.
    document.addEventListener('selectionchange', () => {
      barreTableau.hidden = !(dansEditeur() && parent('td,th'));
    });
  }

  return {
    init,
    texte,
    setHTML(contenu) {
      el.innerHTML = nettoyer(enHtml(contenu));
      palette.hidden = true;
      barreTableau.hidden = true;
    },
    getHTML() { return el.innerHTML; }
  };
})();
