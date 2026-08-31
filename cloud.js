/* Calc Desk cloud layer — Firebase Auth + Firestore. */
(function () {
  const listeners = [];
  const state = { ready: false, configured: false, user: null, error: "", syncing: false, lastSync: null, lastRemoteAt: 0 };
  function configured() {
    const c = window.FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId && window.firebase);
  }
  function emit() { listeners.forEach((fn) => { try { fn(getState()); } catch (e) {} }); }
  function getState() {
    return {
      ready: state.ready, configured: state.configured,
      user: state.user && { uid: state.user.uid, email: state.user.email || "", name: state.user.displayName || "", photo: state.user.photoURL || "" },
      error: state.error, syncing: state.syncing, lastSync: state.lastSync
    };
  }
  function docRef(uid) { return firebase.firestore().doc("users/" + uid + "/data/dojo"); }
  function allowEmail(email) {
    const list = (window.DOJO_ALLOWED_EMAILS || []).map((x) => String(x).toLowerCase());
    if (!list.length) return true;
    return list.includes(String(email || "").toLowerCase());
  }
  function ensureIds(data) {
    const out = {
      sessions: Array.isArray(data && data.sessions) ? data.sessions.slice() : [],
      videos: Object.assign({}, (data && data.videos) || {}),
      opened: Array.isArray(data && data.opened) ? data.opened.slice() : [],
      completedLog: Array.isArray(data && data.completedLog) ? data.completedLog.slice() : [],
      updatedAt: (data && data.updatedAt) || 0
    };
    out.sessions = out.sessions.map((s, i) => {
      if (!s || typeof s !== "object") return null;
      return { id: s.id || ("legacy-" + (s.date || "x") + "-" + i + "-" + (s.seconds || 0)), date: s.date, seconds: Number(s.seconds) || 0 };
    }).filter((s) => s && s.date && s.seconds > 0);
    return out;
  }
  function mergeDojo(local, remote) {
    const a = ensureIds(local), b = ensureIds(remote);
    const sess = new Map();
    a.sessions.concat(b.sessions).forEach((s) => { const prev = sess.get(s.id); if (!prev || s.seconds >= prev.seconds) sess.set(s.id, s); });
    const videos = {};
    const ids = new Set(Object.keys(a.videos).concat(Object.keys(b.videos)));
    ids.forEach((id) => {
      const L = a.videos[id] || {}, R = b.videos[id] || {};
      const done = !!(L.done || R.done);
      const doneDate = done ? ([L.doneDate, R.doneDate].filter(Boolean).sort().pop() || null) : null;
      let scheduledDate = done ? null : (L.scheduledDate || R.scheduledDate || null);
      videos[id] = { done, doneDate, scheduledDate };
    });
    return { sessions: Array.from(sess.values()).sort((x, y) => x.date.localeCompare(y.date)), videos, opened: (a.opened || []).concat(b.opened || []), completedLog: (a.completedLog || []).concat(b.completedLog || []), updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, Date.now()) };
  }
  async function pull() {
    if (!state.user) return null;
    const snap = await docRef(state.user.uid).get();
    if (!snap.exists) return null;
    const val = snap.data() || {};
    state.lastRemoteAt = val.updatedAt || 0;
    return ensureIds(val);
  }
  async function push(data) {
    if (!state.user) return;
    const payload = ensureIds(data);
    payload.updatedAt = Date.now();
    state.lastRemoteAt = payload.updatedAt;
    await docRef(state.user.uid).set(payload, { merge: false });
    state.lastSync = new Date().toISOString();
    emit();
    return payload;
  }
  async function signIn(providerName) {
    state.error = ""; emit();
    if (!state.configured) { state.error = "Cloud is not set up yet."; emit(); return; }
    const provider = providerName === "github" ? new firebase.auth.GithubAuthProvider() : new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try { await firebase.auth().signInWithRedirect(provider); }
    catch (err) { state.error = (err && err.message) || "Sign-in failed. Add this site domain in Firebase Auth authorized domains."; emit(); }
  }
  async function signOut() { if (!state.configured) return; await firebase.auth().signOut(); }
  function init(onChange) {
    if (onChange) listeners.push(onChange);
    if (state.ready) { emit(); return; }
    state.configured = configured();
    if (!state.configured) { state.ready = true; emit(); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      firebase.auth().getRedirectResult().catch((err) => { if (err) { state.error = err.message || "Sign-in failed."; emit(); } });
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user && !allowEmail(user.email)) {
          state.error = "This desk is locked to a specific account."; state.user = null; emit();
          await firebase.auth().signOut(); return;
        }
        state.user = user || null; state.error = ""; state.ready = true; emit();
      });
    } catch (err) {
      state.configured = false; state.ready = true;
      state.error = (err && err.message) || "Firebase failed to start."; emit();
    }
  }
  window.DojoCloud = { init, getState, mergeDojo, ensureIds, pull, push, signInGoogle: () => signIn("google"), signInGithub: () => signIn("github"), signOut, onChange: (fn) => listeners.push(fn) };
})();
