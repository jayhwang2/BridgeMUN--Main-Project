const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authModal = $('#auth-modal');
const conferenceModal = $('#conference-modal');
const publicSite = $('#public-site');
const dashboard = $('#dashboard');
const toast = $('#toast');

const firebaseConfig = {
  apiKey: 'AIzaSyAC9NU6HN5z4G2NDOotSn133bFCZUEUnpA',
  authDomain: 'bridgemun--main-project.firebaseapp.com',
  projectId: 'bridgemun--main-project',
  storageBucket: 'bridgemun--main-project.firebasestorage.app',
  messagingSenderId: '961548612794',
  appId: '1:961548612794:web:4228ae5bc49b331fbdfe83',
  measurementId: 'G-FYEPPXVH46'
};

const firebaseApp = window.firebase ? firebase.initializeApp(firebaseConfig) : null;
const auth = firebaseApp ? firebase.auth() : null;
const db = firebaseApp && firebase.firestore ? firebase.firestore() : null;
const API_BASE = window.BRIDGE_MUN_API_BASE || (['127.0.0.1', 'localhost'].includes(window.location.hostname) ? 'http://127.0.0.1:4181' : '');
document.documentElement.dataset.firebaseAuth = auth ? 'ready' : 'unavailable';
document.documentElement.dataset.firestore = db ? 'ready' : 'unavailable';

const seedConferences = [
  { id: 1, committee: 'UNHCR', name: 'Migration & Human Dignity Forum', topic: 'Protecting displaced young people across borders', date: '21 Nov 2026', format: 'Online', level: 'Beginner friendly', delegates: 42 },
  { id: 2, committee: 'WHO', name: 'Health Equity Summit', topic: 'Closing rural and low-income healthcare gaps', date: '28 Nov 2026', format: 'Hybrid', level: 'Intermediate', delegates: 56 },
  { id: 3, committee: 'UNESCO', name: 'Education Without Borders', topic: 'Expanding quality learning in small communities', date: '5 Dec 2026', format: 'Online', level: 'Beginner friendly', delegates: 31 }
];

let conferences = JSON.parse(localStorage.getItem('bridgeMunConferences') || 'null') || seedConferences;
let currentFilter = 'all';
const countryCatalog = [
  ['Argentina','🇦🇷'],['Australia','🇦🇺'],['Bangladesh','🇧🇩'],['Belgium','🇧🇪'],['Brazil','🇧🇷'],['Canada','🇨🇦'],['Chile','🇨🇱'],['China','🇨🇳'],['Colombia','🇨🇴'],['Costa Rica','🇨🇷'],
  ['Denmark','🇩🇰'],['Egypt','🇪🇬'],['Ethiopia','🇪🇹'],['Finland','🇫🇮'],['France','🇫🇷'],['Germany','🇩🇪'],['Ghana','🇬🇭'],['Greece','🇬🇷'],['India','🇮🇳'],['Indonesia','🇮🇩'],
  ['Ireland','🇮🇪'],['Israel','🇮🇱'],['Italy','🇮🇹'],['Japan','🇯🇵'],['Jordan','🇯🇴'],['Kenya','🇰🇪'],['Malaysia','🇲🇾'],['Mexico','🇲🇽'],['Morocco','🇲🇦'],['Nepal','🇳🇵'],
  ['Netherlands','🇳🇱'],['New Zealand','🇳🇿'],['Nigeria','🇳🇬'],['Norway','🇳🇴'],['Pakistan','🇵🇰'],['Peru','🇵🇪'],['Philippines','🇵🇭'],['Poland','🇵🇱'],['Portugal','🇵🇹'],['Saudi Arabia','🇸🇦'],
  ['Singapore','🇸🇬'],['South Africa','🇿🇦'],['South Korea','🇰🇷'],['Spain','🇪🇸'],['Sweden','🇸🇪'],['Switzerland','🇨🇭'],['Thailand','🇹🇭'],['Türkiye','🇹🇷'],['United Kingdom','🇬🇧'],['United States','🇺🇸']
].map(([name, flag]) => ({ name, flag }));
let forumBuilder = { limit: 30, countries: [] };
let activeForum = null;
let sessionSeconds = 0;
let sessionTimer = null;
let forumUnsubscribe = null;

function setModal(modal, open) {
  modal.hidden = !open;
  document.body.classList.toggle('modal-open', open);
  if (open) setTimeout(() => $('input, select, button', modal)?.focus(), 30);
}

function switchAuth(tab) {
  const register = tab === 'register';
  $('#register-panel').hidden = !register;
  $('#login-panel').hidden = register;
  $$('[data-auth-tab]', authModal).forEach(button => button.setAttribute('aria-selected', String(button.dataset.authTab === tab)));
}

function openAuth(tab) {
  switchAuth(tab);
  setModal(authModal, true);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function forumForFirestore(forum, user) {
  return {
    topic: forum.name,
    subtopic: forum.subtopic || '',
    date: forum.rawDate || '',
    formattedDate: forum.date,
    duration: Number(forum.duration || 30),
    format: forum.format || `${forum.duration || 30} min · Online`,
    level: forum.level || 'Beginner friendly',
    countries: (forum.countries || []).map(country => ({ name: country.name, flag: country.flag, ai: Boolean(country.ai) })),
    assignments: forum.assignments || {},
    speechOrder: forum.speechOrder || [],
    countryCount: Number(forum.delegates || forum.countries?.length || 0),
    createdBy: user.uid,
    createdByEmail: user.email || '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

function forumFromFirestore(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    firestoreId: doc.id,
    committee: 'CUSTOM FORUM',
    name: data.topic,
    subtopic: data.subtopic || '',
    topic: data.subtopic || 'A delegate-led Bridge MUN forum',
    date: data.formattedDate || formatForumDate(data.date),
    rawDate: data.date || '',
    format: data.format || `${data.duration || 30} min · Online`,
    duration: Number(data.duration || 30),
    level: data.level || 'Beginner friendly',
    delegates: Number(data.countryCount || data.countries?.length || 0),
    countries: data.countries || [],
    assignments: data.assignments || {},
    speechOrder: data.speechOrder || [],
    sessionStartedAt: data.sessionStartedAt?.toMillis?.() || null,
    createdAt: data.createdAt?.toMillis?.() || 0,
    isForum: true
  };
}

async function migrateLocalForums(user) {
  if (!db) return;
  const localForums = conferences.filter(item => item.isForum && !item.firestoreId);
  for (const forum of localForums) {
    const payload = forumForFirestore(forum, user);
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    const doc = await db.collection('forums').add(payload);
    forum.firestoreId = doc.id;
    forum.id = doc.id;
  }
  if (localForums.length) localStorage.setItem('bridgeMunConferences', JSON.stringify(conferences));
}

async function subscribeToUserForums(user) {
  if (!db) {
    showToast('Firestore could not load. Forum cloud saving is unavailable.');
    return;
  }
  if (forumUnsubscribe) forumUnsubscribe();
  try {
    await migrateLocalForums(user);
    forumUnsubscribe = db.collection('forums').where('createdBy', '==', user.uid).onSnapshot(snapshot => {
      const remoteForums = snapshot.docs.map(forumFromFirestore).sort((a, b) => b.createdAt - a.createdAt);
      const publicConferences = conferences.filter(item => !item.isForum);
      conferences = [...remoteForums, ...publicConferences];
      localStorage.setItem('bridgeMunConferences', JSON.stringify(conferences));
      renderConferences();
      document.documentElement.dataset.firestoreSync = 'ready';
    }, error => {
      document.documentElement.dataset.firestoreSync = 'error';
      console.error('Firestore forum sync failed', error);
      showToast('Could not sync forums with Firestore.');
    });
  } catch (error) {
    document.documentElement.dataset.firestoreSync = 'error';
    console.error('Firestore forum migration failed', error);
    showToast('Could not save existing forums to Firestore.');
  }
}

function friendlyName(email) {
  const base = (email || 'Delegate').split('@')[0].replace(/[._-]+/g, ' ');
  return base.replace(/\b\w/g, letter => letter.toUpperCase());
}

function enterDashboard(user) {
  const displayName = user.name || friendlyName(user.email);
  const initials = displayName.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  $('#user-initials').textContent = initials;
  $('#user-name').textContent = displayName;
  $('#welcome-name').textContent = displayName.split(' ')[0];
  $('#user-school').textContent = user.school || 'Bridge MUN Delegate';
  const hour = new Date().getHours();
  $('#day-period').textContent = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  setModal(authModal, false);
  publicSite.hidden = true;
  dashboard.hidden = false;
  window.scrollTo(0, 0);
  renderConferences();
}

function leaveDashboard() {
  dashboard.hidden = true;
  publicSite.hidden = false;
  window.scrollTo(0, 0);
}

function setAuthBusy(form, busy) {
  const button = $('button[type="submit"]', form);
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.innerHTML = busy ? 'Please wait…' : button.dataset.label;
}

function authErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'An account already exists with this email. Try logging in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/weak-password': 'Use a stronger password with at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Could not reach Firebase. Check your internet connection.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase yet.'
  };
  return messages[error?.code] || 'Authentication failed. Please try again.';
}

function renderConferences() {
  const query = ($('#conference-search')?.value || '').toLowerCase();
  const list = conferences.filter(item => {
    const matchesQuery = `${item.name} ${item.committee} ${item.topic}`.toLowerCase().includes(query);
    const matchesFilter = currentFilter === 'all' || (currentFilter === 'online' && item.format === 'Online') || (currentFilter === 'beginner' && item.level === 'Beginner friendly');
    return matchesQuery && matchesFilter;
  });
  $('#conference-grid').innerHTML = list.length ? list.map(item => `
    <article class="conference-card">
      <div class="card-tags"><span class="committee-tag">${escapeHtml(item.committee)}</span>${item.firestoreId ? '<span class="cloud-saved">☁ Firestore</span>' : ''}</div>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.topic)}</p>
      <div class="card-meta"><span>◷ ${escapeHtml(item.date)}</span><span>◎ ${escapeHtml(item.format)}</span></div>
      <div class="card-footer"><span>♙ ${item.delegates} delegates</span><button type="button" ${item.isForum ? `data-forum-id="${item.id}"` : 'data-join'}>${item.isForum ? 'Enter forum' : 'View details'} →</button></div>
    </article>`).join('') : '<article class="conference-card"><h3>No conferences found</h3><p>Try another search or filter.</p></article>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
}

function shuffledCountries() {
  return shuffle([...countryCatalog]);
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function updateForumBuilder() {
  $('#country-count').value = forumBuilder.limit;
  $('#country-count-value').textContent = forumBuilder.limit;
  $('#selected-country-count').textContent = `(${forumBuilder.countries.length}/${forumBuilder.limit})`;
  const aiCount = forumBuilder.countries.filter(country => country.ai).length;
  $('#ai-country-count').textContent = `${aiCount} / ${forumBuilder.countries.length}`;
  $$('.country-presets button').forEach(button => {
    const value = button.dataset.countryPreset === 'g7' ? 7 : Number(button.dataset.countryPreset);
    button.classList.toggle('active', value === forumBuilder.limit);
  });
  $('#selected-countries').innerHTML = forumBuilder.countries.length ? forumBuilder.countries.map(country => `
    <div class="country-chip">
      <span>${country.flag}</span><b>${escapeHtml(country.name)}</b>
      <button class="country-ai ${country.ai ? 'active' : ''}" type="button" data-country-ai="${escapeHtml(country.name)}">AI</button>
      <button class="country-remove" type="button" data-country-remove="${escapeHtml(country.name)}" aria-label="Remove ${escapeHtml(country.name)}">×</button>
    </div>`).join('') : '<p>Select countries manually or use Random to fill the forum.</p>';
  $('.save-forum').disabled = forumBuilder.countries.length !== forumBuilder.limit;
}

function setCountryLimit(limit) {
  forumBuilder.limit = Math.max(7, Math.min(50, Number(limit)));
  if (forumBuilder.countries.length > forumBuilder.limit) forumBuilder.countries = forumBuilder.countries.slice(0, forumBuilder.limit);
  updateForumBuilder();
}

function addCountry(country) {
  if (!country || forumBuilder.countries.length >= forumBuilder.limit || forumBuilder.countries.some(item => item.name === country.name)) return;
  forumBuilder.countries.push({ ...country, ai: false });
  $('#country-search').value = '';
  $('#country-results').hidden = true;
  updateForumBuilder();
}

function openForumBuilder() {
  forumBuilder = { limit: 30, countries: [] };
  $('#conference-form').reset();
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  $('#forum-date').min = today.toISOString().slice(0, 10);
  $('#forum-date').value = nextWeek.toISOString().slice(0, 10);
  updateForumBuilder();
  setModal(conferenceModal, true);
}

function formatForumDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function updateRoomTimer() {
  const minutes = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
  const seconds = String(sessionSeconds % 60).padStart(2, '0');
  $('#session-timer').textContent = `${minutes}:${seconds}`;
}

function currentPhase() {
  return $('#agenda-steps button.active')?.dataset.phase || 'Roll Call';
}

function appendRoomMessage(author, message, { ai = false, system = false } = {}) {
  const classes = ['room-message', ai ? 'ai-message' : '', system ? 'system-message' : ''].filter(Boolean).join(' ');
  const initials = system ? 'BM' : ai ? 'AI' : author.slice(0, 2).toUpperCase();
  $('#message-list').insertAdjacentHTML('beforeend', `<div class="${classes}"><span>${escapeHtml(initials)}</span><p><b>${escapeHtml(author)}</b><small>${escapeHtml(message)}</small></p></div>`);
  $('#message-list').scrollTop = $('#message-list').scrollHeight;
}

function renderSpeechOrder(forum) {
  const order = forum.speechOrder || [];
  $('#speech-order-state').textContent = order.length ? `${order.length} delegations · saved to Firestore` : 'Created when the conference starts';
  $('#speech-order-list').innerHTML = order.length ? order.map((countryName, index) => {
    const country = forum.countries.find(item => item.name === countryName) || { name: countryName, ai: false };
    return `<div class="speech-order-item ${country.ai ? 'ai' : ''}"><span>${index + 1}</span><b>${escapeHtml(country.name)}</b><small>${country.ai ? 'AI delegate' : 'Human delegate'}</small></div>`;
  }).join('') : '<p>Start the conference to shuffle all delegations into a speaking order.</p>';
}

function renderRoomCountries(forum) {
  const assignments = forum.assignments || {};
  const currentUid = auth?.currentUser?.uid;
  const assignedCountries = new Map(Object.values(assignments).map(assignment => [assignment.country, assignment]));
  $('#room-country-list').innerHTML = forum.countries.map(country => {
    const assignment = assignedCountries.get(country.name);
    const isMine = assignment?.uid === currentUid;
    const subtitle = country.ai ? 'GPT-powered delegate' : isMine ? `You · ${assignment.displayName}` : assignment ? assignment.displayName : 'Open human seat';
    const control = country.ai
      ? `<button class="ai-speech-button" type="button" data-ai-speech="${escapeHtml(country.name)}" ${forum.speechOrder?.length ? '' : 'disabled'}>Speech</button>`
      : `<i>${isMine ? 'YOU' : 'H'}</i>`;
    return `<div class="${isMine ? 'assigned-seat' : ''}"><span>${country.flag}</span><p><b>${escapeHtml(country.name)}</b><small>${escapeHtml(subtitle)}</small></p>${control}</div>`;
  }).join('');

  const mine = currentUid ? assignments[currentUid] : null;
  const hasHumanSeats = forum.countries.some(country => !country.ai);
  $('#human-assignment').textContent = mine ? `${mine.flag || '◎'} You represent ${mine.country}` : hasHumanSeats ? 'No human seat is currently available' : 'AI-only conference';
}

async function assignCurrentUserToCountry(forum) {
  if (!db || !auth?.currentUser || !forum.firestoreId) return null;
  if (!(forum.countries || []).some(country => !country.ai)) return null;
  const user = auth.currentUser;
  const forumRef = db.collection('forums').doc(forum.firestoreId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(forumRef);
    if (!snapshot.exists) throw new Error('Forum not found');
    const data = snapshot.data();
    const assignments = data.assignments || {};
    if (assignments[user.uid]) {
      forum.assignments = assignments;
      return assignments[user.uid];
    }
    const occupied = new Set(Object.values(assignments).map(assignment => assignment.country));
    const available = (data.countries || []).filter(country => !country.ai && !occupied.has(country.name));
    if (!available.length) {
      forum.assignments = assignments;
      return null;
    }
    const country = available[Math.floor(Math.random() * available.length)];
    const assignment = {
      uid: user.uid,
      displayName: user.displayName || friendlyName(user.email),
      country: country.name,
      flag: country.flag,
      assignedAt: new Date().toISOString()
    };
    transaction.update(forumRef, {
      [`assignments.${user.uid}`]: assignment,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    forum.assignments = { ...assignments, [user.uid]: assignment };
    return assignment;
  });
}

async function openForumRoom(forum) {
  activeForum = forum;
  sessionSeconds = Number(forum.duration || 30) * 60;
  clearInterval(sessionTimer);
  sessionTimer = null;
  $('#start-session').textContent = forum.speechOrder?.length ? 'Start Conference' : 'Start Conference';
  $('#room-status').textContent = '● Ready';
  $('#room-status').classList.remove('live');
  $('#room-topic').textContent = forum.name;
  $('#room-subtopic').textContent = forum.subtopic || forum.topic;
  $('#room-meta').innerHTML = `<span>▣ ${escapeHtml(forum.date)}</span><span>◷ ${forum.duration} minutes</span><span>◎ Online</span>`;
  $('#room-country-count').textContent = forum.countries.length;
  renderRoomCountries(forum);
  renderSpeechOrder(forum);
  $('#message-list').innerHTML = '<div class="room-message system-message"><span>BM</span><p><b>Bridge MUN</b><small>The room is ready. Start the session when your delegates arrive.</small></p></div>';
  $$('#agenda-steps button').forEach((button, index) => button.classList.toggle('active', index === 0));
  updateRoomTimer();
  $('.dashboard-content').hidden = true;
  $('#forum-room').hidden = false;
  window.scrollTo(0, 0);
  try {
    const assignment = await assignCurrentUserToCountry(forum);
    renderRoomCountries(forum);
    if (assignment) showToast(`You were randomly assigned to represent ${assignment.country}.`);
  } catch (error) {
    console.error('Country assignment failed', error);
    $('#human-assignment').textContent = 'Country assignment could not be saved';
    showToast('Could not assign a human country. Please re-enter the forum.');
  }
}

function closeForumRoom() {
  clearInterval(sessionTimer);
  sessionTimer = null;
  $('#forum-room').hidden = true;
  $('.dashboard-content').hidden = false;
  activeForum = null;
  window.scrollTo(0, 0);
}

$$('[data-open-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.openAuth)));
$$('[data-auth-tab]').forEach(button => button.addEventListener('click', () => switchAuth(button.dataset.authTab)));
$$('.modal-close', authModal).forEach(button => button.addEventListener('click', () => setModal(authModal, false)));
authModal.addEventListener('click', event => { if (event.target === authModal) setModal(authModal, false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { setModal(authModal, false); setModal(conferenceModal, false); } });

$('#register-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!auth) {
    showToast('Firebase could not load. Check your internet connection.');
    return;
  }
  setAuthBusy(event.currentTarget, true);
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const user = { email: data.email, school: data.school, grade: data.grade, gender: data.gender, nationality: data.nationality, name: friendlyName(data.email) };
  try {
    const credential = await auth.createUserWithEmailAndPassword(data.email, data.password);
    await credential.user.updateProfile({ displayName: user.name });
    localStorage.setItem(`bridgeMunProfile:${credential.user.uid}`, JSON.stringify(user));
    enterDashboard(user);
    event.currentTarget.reset();
    showToast('Welcome to Bridge MUN — your Firebase account is ready.');
  } catch (error) {
    showToast(authErrorMessage(error));
  } finally {
    setAuthBusy(event.currentTarget, false);
  }
});

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!auth) {
    showToast('Firebase could not load. Check your internet connection.');
    return;
  }
  setAuthBusy(event.currentTarget, true);
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const remember = $('input[type="checkbox"]', event.currentTarget).checked;
  try {
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    const credential = await auth.signInWithEmailAndPassword(data.email, data.password);
    const profile = JSON.parse(localStorage.getItem(`bridgeMunProfile:${credential.user.uid}`) || 'null');
    const user = profile || { email: credential.user.email, name: credential.user.displayName || friendlyName(credential.user.email), school: 'Bridge MUN Delegate' };
    enterDashboard(user);
    event.currentTarget.reset();
    showToast(`Welcome back, ${user.name || friendlyName(user.email)}.`);
  } catch (error) {
    showToast(authErrorMessage(error));
  } finally {
    setAuthBusy(event.currentTarget, false);
  }
});

$('#logout-button').addEventListener('click', async () => {
  if (!auth) return leaveDashboard();
  try {
    await auth.signOut();
    showToast('You have been logged out.');
  } catch (error) {
    showToast('Could not log out. Please try again.');
  }
});
$('#create-conference-button').addEventListener('click', openForumBuilder);
$('.modal-close', conferenceModal).addEventListener('click', () => setModal(conferenceModal, false));
conferenceModal.addEventListener('click', event => { if (event.target === conferenceModal) setModal(conferenceModal, false); });
$('#conference-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (forumBuilder.countries.length !== forumBuilder.limit) {
    showToast(`Select exactly ${forumBuilder.limit} countries before continuing.`);
    return;
  }
  const forum = {
    id: Date.now(),
    committee: 'CUSTOM FORUM',
    name: data.topic,
    subtopic: data.subtopic,
    topic: data.subtopic || 'A new delegate-led Bridge MUN forum',
    date: formatForumDate(data.date),
    rawDate: data.date,
    format: `${data.duration} min · Online`,
    duration: Number(data.duration),
    level: 'Beginner friendly',
    delegates: forumBuilder.countries.length,
    countries: forumBuilder.countries.map(country => ({ ...country })),
    isForum: true
  };
  if (!db || !auth?.currentUser) {
    showToast('Sign in and check your connection before saving to Firestore.');
    return;
  }
  setAuthBusy(event.currentTarget, true);
  try {
    const payload = forumForFirestore(forum, auth.currentUser);
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    const doc = await db.collection('forums').add(payload);
    forum.id = doc.id;
    forum.firestoreId = doc.id;
    conferences.unshift(forum);
    localStorage.setItem('bridgeMunConferences', JSON.stringify(conferences));
    event.currentTarget.reset();
    setModal(conferenceModal, false);
    renderConferences();
    openForumRoom(forum);
    showToast('Forum saved to Firestore and ready to use.');
  } catch (error) {
    console.error('Firestore forum save failed', error);
    showToast('Firestore save failed. Please try again.');
  } finally {
    setAuthBusy(event.currentTarget, false);
  }
});

$('#country-count').addEventListener('input', event => setCountryLimit(event.target.value));
$$('[data-country-preset]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.countryPreset === 'g7') {
    const g7 = ['Canada', 'France', 'Germany', 'Italy', 'Japan', 'United Kingdom', 'United States'];
    forumBuilder = { limit: 7, countries: g7.map(name => ({ ...countryCatalog.find(country => country.name === name), ai: false })) };
    updateForumBuilder();
    return;
  }
  setCountryLimit(button.dataset.countryPreset);
}));
$('#random-countries').addEventListener('click', () => {
  forumBuilder.countries = shuffledCountries().slice(0, forumBuilder.limit).map(country => ({ ...country, ai: false }));
  updateForumBuilder();
});
$('#country-search').addEventListener('input', event => {
  const query = event.target.value.trim().toLowerCase();
  const matches = query ? countryCatalog.filter(country => country.name.toLowerCase().includes(query) && !forumBuilder.countries.some(item => item.name === country.name)).slice(0, 8) : [];
  $('#country-results').hidden = !matches.length;
  $('#country-results').innerHTML = matches.map(country => `<button type="button" data-country-add="${escapeHtml(country.name)}"><span>${country.flag}</span>${escapeHtml(country.name)}<i>＋</i></button>`).join('');
});
$('#country-results').addEventListener('click', event => {
  const button = event.target.closest('[data-country-add]');
  if (button) addCountry(countryCatalog.find(country => country.name === button.dataset.countryAdd));
});
$('#selected-countries').addEventListener('click', event => {
  const remove = event.target.closest('[data-country-remove]');
  const toggle = event.target.closest('[data-country-ai]');
  if (remove) forumBuilder.countries = forumBuilder.countries.filter(country => country.name !== remove.dataset.countryRemove);
  if (toggle) {
    const country = forumBuilder.countries.find(item => item.name === toggle.dataset.countryAi);
    if (country) country.ai = !country.ai;
  }
  updateForumBuilder();
});
$('#ai-all-on').addEventListener('click', () => { forumBuilder.countries.forEach(country => { country.ai = true; }); updateForumBuilder(); });
$('#ai-all-off').addEventListener('click', () => { forumBuilder.countries.forEach(country => { country.ai = false; }); updateForumBuilder(); });

$('#conference-search').addEventListener('input', renderConferences);
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  $$('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderConferences();
}));
document.addEventListener('click', event => {
  const forumButton = event.target.closest('[data-forum-id]');
  if (forumButton) {
    const forum = conferences.find(item => String(item.id) === forumButton.dataset.forumId);
    if (forum) openForumRoom(forum);
    return;
  }
  if (event.target.closest('[data-join]')) showToast('Conference details will open in the next platform phase.');
});

$('#room-back').addEventListener('click', closeForumRoom);
$('#start-session').addEventListener('click', async event => {
  const startButton = event.currentTarget;
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
    startButton.textContent = 'Resume Conference';
    $('#room-status').textContent = '● Paused';
    $('#room-status').classList.remove('live');
    return;
  }
  if (!activeForum?.speechOrder?.length) {
    if (!db || !activeForum.firestoreId) {
      showToast('This forum must be saved to Firestore before it can start.');
      return;
    }
    startButton.disabled = true;
    startButton.textContent = 'Creating order…';
    try {
      activeForum.speechOrder = shuffle(activeForum.countries.map(country => country.name));
      await db.collection('forums').doc(activeForum.firestoreId).update({
        speechOrder: activeForum.speechOrder,
        sessionStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      renderSpeechOrder(activeForum);
      renderRoomCountries(activeForum);
      appendRoomMessage('Bridge MUN', 'The random speakers list is ready. AI countries can now deliver a speech.', { system: true });
    } catch (error) {
      activeForum.speechOrder = [];
      console.error('Speech order save failed', error);
      showToast('Could not save the speech order to Firestore.');
      startButton.textContent = 'Start Conference';
      startButton.disabled = false;
      return;
    }
    startButton.disabled = false;
  }
  if (sessionSeconds <= 0) sessionSeconds = Number(activeForum?.duration || 30) * 60;
  startButton.textContent = 'Pause Conference';
  $('#room-status').textContent = '● Live';
  $('#room-status').classList.add('live');
  sessionTimer = setInterval(() => {
    sessionSeconds -= 1;
    updateRoomTimer();
    if (sessionSeconds <= 0) {
      clearInterval(sessionTimer);
      sessionTimer = null;
      startButton.textContent = 'Restart Conference';
      $('#room-status').textContent = '● Complete';
      $('#room-status').classList.remove('live');
      showToast('The forum timer is complete.');
    }
  }, 1000);
});
$$('#agenda-steps button').forEach(button => button.addEventListener('click', () => {
  $$('#agenda-steps button').forEach(item => item.classList.toggle('active', item === button));
  showToast(`Committee phase: ${button.dataset.phase}`);
}));
$('#message-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#message-input');
  const message = input.value.trim();
  if (!message) return;
  const name = $('#user-name').textContent || 'Chair';
  appendRoomMessage(name, message);
  input.value = '';
});

$('#room-country-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-ai-speech]');
  if (!button || !activeForum) return;
  if (!activeForum.speechOrder?.length) {
    showToast('Start the conference before asking an AI delegate to speak.');
    return;
  }
  if (!auth?.currentUser) {
    showToast('Please sign in again before generating a speech.');
    return;
  }
  const country = button.dataset.aiSpeech;
  const previousLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Thinking…';
  try {
    const token = await auth.currentUser.getIdToken();
    const recentMessages = $$('#message-list .room-message small').slice(-5).map(item => item.textContent);
    const response = await fetch(`${API_BASE}/api/ai/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        forumId: activeForum.firestoreId,
        country,
        phase: currentPhase(),
        priorMessages: recentMessages
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result.error === 'openai_not_configured') throw new Error('The server needs a new OPENAI_API_KEY.');
      throw new Error(result.message || 'The AI delegate could not generate a speech.');
    }
    appendRoomMessage(`${country} · AI Delegate`, result.text, { ai: true });
    showToast(`${country}'s speech was generated and saved to Firestore.`);
  } catch (error) {
    console.error('AI speech failed', error);
    showToast(error.message || 'Could not reach the AI speech server.');
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
});

const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }), { threshold: .12 });
$$('.reveal').forEach(element => observer.observe(element));
renderConferences();
if (auth) {
  auth.onAuthStateChanged(firebaseUser => {
    if (!firebaseUser) {
      if (forumUnsubscribe) forumUnsubscribe();
      forumUnsubscribe = null;
      leaveDashboard();
      return;
    }
    const profile = JSON.parse(localStorage.getItem(`bridgeMunProfile:${firebaseUser.uid}`) || 'null');
    enterDashboard(profile || {
      email: firebaseUser.email,
      name: firebaseUser.displayName || friendlyName(firebaseUser.email),
      school: 'Bridge MUN Delegate'
    });
    subscribeToUserForums(firebaseUser);
  });
}
