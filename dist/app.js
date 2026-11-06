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
document.documentElement.dataset.firebaseAuth = auth ? 'ready' : 'unavailable';

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
      <span class="committee-tag">${escapeHtml(item.committee)}</span>
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
  return [...countryCatalog].sort(() => Math.random() - 0.5);
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

function openForumRoom(forum) {
  activeForum = forum;
  sessionSeconds = Number(forum.duration || 30) * 60;
  clearInterval(sessionTimer);
  sessionTimer = null;
  $('#start-session').textContent = 'Start Session';
  $('#room-status').textContent = '● Ready';
  $('#room-status').classList.remove('live');
  $('#room-topic').textContent = forum.name;
  $('#room-subtopic').textContent = forum.subtopic || forum.topic;
  $('#room-meta').innerHTML = `<span>▣ ${escapeHtml(forum.date)}</span><span>◷ ${forum.duration} minutes</span><span>◎ Online</span>`;
  $('#room-country-count').textContent = forum.countries.length;
  $('#room-country-list').innerHTML = forum.countries.map(country => `<div><span>${country.flag}</span><p><b>${escapeHtml(country.name)}</b><small>${country.ai ? 'AI Delegate' : 'Human Delegate'}</small></p><i class="${country.ai ? 'ai' : ''}">${country.ai ? 'AI' : 'H'}</i></div>`).join('');
  $('#message-list').innerHTML = '<div class="room-message system-message"><span>BM</span><p><b>Bridge MUN</b><small>The room is ready. Start the session when your delegates arrive.</small></p></div>';
  $$('#agenda-steps button').forEach((button, index) => button.classList.toggle('active', index === 0));
  updateRoomTimer();
  $('.dashboard-content').hidden = true;
  $('#forum-room').hidden = false;
  window.scrollTo(0, 0);
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
$('#conference-form').addEventListener('submit', event => {
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
  conferences.unshift(forum);
  localStorage.setItem('bridgeMunConferences', JSON.stringify(conferences));
  event.currentTarget.reset();
  setModal(conferenceModal, false);
  renderConferences();
  openForumRoom(forum);
  showToast('Your forum room is ready.');
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
$('#start-session').addEventListener('click', event => {
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
    event.currentTarget.textContent = 'Resume Session';
    $('#room-status').textContent = '● Paused';
    $('#room-status').classList.remove('live');
    return;
  }
  if (sessionSeconds <= 0) sessionSeconds = Number(activeForum?.duration || 30) * 60;
  event.currentTarget.textContent = 'Pause Session';
  $('#room-status').textContent = '● Live';
  $('#room-status').classList.add('live');
  sessionTimer = setInterval(() => {
    sessionSeconds -= 1;
    updateRoomTimer();
    if (sessionSeconds <= 0) {
      clearInterval(sessionTimer);
      sessionTimer = null;
      event.currentTarget.textContent = 'Restart Session';
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
  $('#message-list').insertAdjacentHTML('beforeend', `<div class="room-message"><span>${escapeHtml(name.slice(0, 2).toUpperCase())}</span><p><b>${escapeHtml(name)}</b><small>${escapeHtml(message)}</small></p></div>`);
  input.value = '';
  $('#message-list').scrollTop = $('#message-list').scrollHeight;
});

const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }), { threshold: .12 });
$$('.reveal').forEach(element => observer.observe(element));
renderConferences();
if (auth) {
  auth.onAuthStateChanged(firebaseUser => {
    if (!firebaseUser) {
      leaveDashboard();
      return;
    }
    const profile = JSON.parse(localStorage.getItem(`bridgeMunProfile:${firebaseUser.uid}`) || 'null');
    enterDashboard(profile || {
      email: firebaseUser.email,
      name: firebaseUser.displayName || friendlyName(firebaseUser.email),
      school: 'Bridge MUN Delegate'
    });
  });
}
