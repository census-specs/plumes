// Étape 2 : notes avec éditeur riche (le contenu est stocké en HTML).
const $ = (s) => document.querySelector(s);
let ongletCourant = 'notes';
let noteCourante = null;
let minuteur = null;

// ---------- Navigation ----------
function afficherVue(nom) {
  document.querySelectorAll('.vue').forEach((v) => v.classList.remove('active'));
  $('#vue-' + nom).classList.add('active');
  const enEdition = nom === 'edition';
  document.querySelector('.onglets').style.display = enEdition ? 'none' : 'flex';
  $('.topbar').style.display = enEdition ? 'none' : 'flex';
  if (!enEdition) {
    ongletCourant = nom;
    $('#titre-ecran').textContent = nom === 'notes' ? 'Notes' : 'Tâches';
    document.querySelectorAll('.onglet').forEach((o) =>
      o.classList.toggle('active', o.dataset.vue === nom));
  }
}

document.querySelectorAll('.onglet').forEach((o) =>
  o.addEventListener('click', () => { afficherVue(o.dataset.vue); }));

// ---------- Liste des notes ----------
function echapper(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

async function rafraichirNotes() {
  const notes = (await DB.tout('notes')).sort((a, b) => b.modifie - a.modifie);
  $('#vide-notes').style.display = notes.length ? 'none' : 'block';
  $('#liste-notes').innerHTML = notes.map((n) => `
    <li data-id="${n.id}">
      <div class="titre">${echapper(n.titre || 'Sans titre')}</div>
      <div class="apercu">${echapper(Editeur.texte(n.contenu).slice(0, 80)) || 'Note vide'}</div>
    </li>`).join('');
}

$('#liste-notes').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (li) ouvrirNote(await DB.lire('notes', li.dataset.id));
});

// ---------- Édition d'une note ----------
function ouvrirNote(note) {
  noteCourante = note;
  $('#note-titre').value = note.titre;
  Editeur.setHTML(note.contenu);
  afficherVue('edition');
  $('main').scrollTop = 0;
}

async function sauvegarderNote() {
  if (!noteCourante) return;
  noteCourante.titre = $('#note-titre').value;
  noteCourante.contenu = Editeur.getHTML();
  noteCourante.modifie = Date.now();
  await DB.enregistrer('notes', noteCourante);
}

function sauvegardeDifferee() {
  clearTimeout(minuteur);
  minuteur = setTimeout(sauvegarderNote, 400);
}
$('#note-titre').addEventListener('input', sauvegardeDifferee);
$('#note-contenu').addEventListener('input', sauvegardeDifferee);

// Sauvegarde de sécurité si l'application passe en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && noteCourante) { clearTimeout(minuteur); sauvegarderNote(); }
});

$('#btn-retour').addEventListener('click', async () => {
  clearTimeout(minuteur);
  await sauvegarderNote();
  noteCourante = null;
  await rafraichirNotes();
  afficherVue('notes');
});

$('#btn-supprimer').addEventListener('click', async () => {
  if (!confirm('Supprimer cette note ?')) return;
  clearTimeout(minuteur);
  await DB.supprimer('notes', noteCourante.id);
  noteCourante = null;
  await rafraichirNotes();
  afficherVue('notes');
});

// ---------- Bouton + ----------
$('#btn-ajouter').addEventListener('click', () => {
  if (ongletCourant === 'notes') {
    ouvrirNote({ id: DB.nouvelId(), titre: '', contenu: '', cree: Date.now(), modifie: Date.now() });
  } else {
    alert('Les tâches arrivent à l\'étape suivante.');
  }
});

// ---------- Démarrage ----------
Editeur.init();
rafraichirNotes();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
