const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authModal = $('#auth-modal');
const conferenceModal = $('#conference-modal');
const publicSite = $('#public-site');
const dashboard = $('#dashboard');
const toast = $('#toast');

const seedConferences = [
  { id: 1, committee: 'UNHCR', name: 'Migration & Human Dignity Forum', topic: 'Protecting displaced young people across borders', date: '21 Nov 2026', format: 'Online', level: 'Beginner friendly', delegates: 42 },
  { id: 2, committee: 'WHO', name: 'Health Equity Summit', topic: 'Closing rural and low-income healthcare gaps', date: '28 Nov 2026', format: 'Hybrid', level: 'Intermediate', delegates: 56 },
  { id: 3, committee: 'UNESCO', name: 'Education Without Borders', topic: 'Expanding quality learning in small communities', date: '5 Dec 2026', format: 'Online', level: 'Beginner friendly', delegates: 31 }
];

let conferences = JSON.parse(localStorage.getItem('bridgeMunConferences') || 'null') || seedConferences;
let currentFilter = 'all';

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

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('bridgeMunUser')); } catch { return null; }
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
  sessionStorage.removeItem('bridgeMunSession');
  dashboard.hidden = true;
  publicSite.hidden = false;
  window.scrollTo(0, 0);
  showToast('You have been logged out.');
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
      <div class="card-footer"><span>♙ ${item.delegates} delegates</span><button type="button" data-join>View details →</button></div>
    </article>`).join('') : '<article class="conference-card"><h3>No conferences found</h3><p>Try another search or filter.</p></article>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
}

$$('[data-open-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.openAuth)));
$$('[data-auth-tab]').forEach(button => button.addEventListener('click', () => switchAuth(button.dataset.authTab)));
$$('.modal-close', authModal).forEach(button => button.addEventListener('click', () => setModal(authModal, false)));
authModal.addEventListener('click', event => { if (event.target === authModal) setModal(authModal, false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { setModal(authModal, false); setModal(conferenceModal, false); } });

$('#register-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const user = { email: data.email, school: data.school, grade: data.grade, gender: data.gender, nationality: data.nationality, name: friendlyName(data.email) };
  localStorage.setItem('bridgeMunUser', JSON.stringify(user));
  sessionStorage.setItem('bridgeMunSession', 'active');
  enterDashboard(user);
  showToast('Welcome to Bridge MUN — your profile is ready.');
});

$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const saved = getStoredUser();
  const user = saved && saved.email.toLowerCase() === data.email.toLowerCase() ? saved : { email: data.email, name: friendlyName(data.email), school: 'Bridge MUN Delegate' };
  sessionStorage.setItem('bridgeMunSession', 'active');
  enterDashboard(user);
  showToast(`Welcome back, ${user.name || friendlyName(user.email)}.`);
});

$('#logout-button').addEventListener('click', leaveDashboard);
$('#create-conference-button').addEventListener('click', () => setModal(conferenceModal, true));
$('.modal-close', conferenceModal).addEventListener('click', () => setModal(conferenceModal, false));
conferenceModal.addEventListener('click', event => { if (event.target === conferenceModal) setModal(conferenceModal, false); });
$('#conference-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const date = new Date(`${data.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  conferences.unshift({ id: Date.now(), committee: data.committee, name: data.name, topic: `${data.level} committee now accepting applications`, date, format: data.format, level: data.level, delegates: 1 });
  localStorage.setItem('bridgeMunConferences', JSON.stringify(conferences));
  event.currentTarget.reset();
  setModal(conferenceModal, false);
  renderConferences();
  showToast('Conference created successfully.');
});

$('#conference-search').addEventListener('input', renderConferences);
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  $$('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderConferences();
}));
document.addEventListener('click', event => { if (event.target.closest('[data-join]')) showToast('Conference details will open in the next platform phase.'); });

const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }), { threshold: .12 });
$$('.reveal').forEach(element => observer.observe(element));
renderConferences();
if (sessionStorage.getItem('bridgeMunSession') === 'active' && getStoredUser()) enterDashboard(getStoredUser());
