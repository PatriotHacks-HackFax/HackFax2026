import { useEffect, useMemo, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import * as api from '../api/backend';
import styles from './Layout.module.css';

function emptyContact() {
  return { name: '', relation: '', phone: '' };
}

export default function Layout() {
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileAge, setProfileAge] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const [profileHeightCm, setProfileHeightCm] = useState('');
  const [profileWeightKg, setProfileWeightKg] = useState('');
  const [contacts, setContacts] = useState([emptyContact()]);

  useEffect(() => {
    async function hydrate() {
      try {
        const res = await api.fetchMe();
        if (res?.user) {
          setUser(res.user);
          setProfileName(res.user.name || '');
          setProfileAge(res.user.age != null ? String(res.user.age) : '');
          setProfileGender(res.user.gender || '');
          setProfileHeightCm(res.user.heightCm != null ? String(res.user.heightCm) : '');
          setProfileWeightKg(res.user.weightKg != null ? String(res.user.weightKg) : '');
          setContacts(res.user.emergencyContacts?.length ? res.user.emergencyContacts : [emptyContact()]);
        }
      } catch (_err) {
        api.clearAuthToken();
      }
    }
    hydrate();
  }, []);

  const authTitle = useMemo(() => (authMode === 'login' ? 'Log in' : 'Create account'), [authMode]);

  function openLogin() {
    setAuthMode('login');
    setAuthError('');
    setAuthOpen(true);
  }

  function openSignup() {
    setAuthMode('signup');
    setAuthError('');
    setAuthOpen(true);
  }

  function closeAuth() {
    setAuthOpen(false);
    setAuthError('');
    setPasswordInput('');
  }

  function openProfile() {
    if (!user) {
      openLogin();
      return;
    }
    setProfileMessage('');
    setProfileName(user.name || '');
    setProfileAge(user.age != null ? String(user.age) : '');
    setProfileGender(user.gender || '');
    setProfileHeightCm(user.heightCm != null ? String(user.heightCm) : '');
    setProfileWeightKg(user.weightKg != null ? String(user.weightKg) : '');
    setContacts(user.emergencyContacts?.length ? user.emergencyContacts : [emptyContact()]);
    setProfileOpen(true);
  }

  function closeProfile() {
    setProfileOpen(false);
    setProfileMessage('');
  }

  function logout() {
    api.clearAuthToken();
    setUser(null);
    setProfileOpen(false);
    setContacts([emptyContact()]);
    setProfileName('');
    setProfileAge('');
    setProfileGender('');
    setProfileHeightCm('');
    setProfileWeightKg('');
  }

  async function submitAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      let result;
      if (authMode === 'signup') {
        result = await api.signup({ name: nameInput, email: emailInput, password: passwordInput });
      } else {
        result = await api.login({ email: emailInput, password: passwordInput });
      }

      if (result?.user) {
        setUser(result.user);
        setProfileName(result.user.name || '');
        setProfileAge(result.user.age != null ? String(result.user.age) : '');
        setProfileGender(result.user.gender || '');
        setProfileHeightCm(result.user.heightCm != null ? String(result.user.heightCm) : '');
        setProfileWeightKg(result.user.weightKg != null ? String(result.user.weightKg) : '');
        setContacts(result.user.emergencyContacts?.length ? result.user.emergencyContacts : [emptyContact()]);
      }

      setEmailInput('');
      setPasswordInput('');
      setNameInput('');
      closeAuth();
    } catch (err) {
      const msg = err?.body?.error || err?.message || 'Authentication failed';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }

  function updateContact(index, field, value) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addContact() {
    setContacts((prev) => [...prev, emptyContact()]);
  }

  function removeContact(index) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileMessage('');
    setProfileLoading(true);

    try {
      const trimmedName = String(profileName || '').trim();
      const age = Number(profileAge);
      const heightCm = Number(profileHeightCm);
      const weightKg = Number(profileWeightKg);

      if (!trimmedName) throw new Error('Name is required');
      if (!Number.isFinite(age) || age < 1 || age > 130) throw new Error('Age must be between 1 and 130');
      if (!profileGender) throw new Error('Gender is required');
      if (!Number.isFinite(heightCm) || heightCm < 30 || heightCm > 300) throw new Error('Height must be between 30 and 300 cm');
      if (!Number.isFinite(weightKg) || weightKg < 2 || weightKg > 500) throw new Error('Weight must be between 2 and 500 kg');

      const cleanContacts = contacts
        .map((c) => ({
          name: String(c.name || '').trim(),
          relation: String(c.relation || '').trim(),
          phone: String(c.phone || '').trim(),
        }))
        .filter((c) => c.name || c.relation || c.phone);

      if (cleanContacts.length < 1) {
        throw new Error('At least one emergency contact is required');
      }
      if (cleanContacts.some((c) => !c.name || !c.relation || !c.phone)) {
        throw new Error('Each emergency contact must include name, relation, and phone');
      }

      const result = await api.updateProfile({
        name: trimmedName,
        age,
        gender: profileGender,
        heightCm,
        weightKg,
        emergencyContacts: cleanContacts,
      });

      if (result?.user) {
        setUser(result.user);
        setProfileName(result.user.name || '');
        setProfileAge(result.user.age != null ? String(result.user.age) : '');
        setProfileGender(result.user.gender || '');
        setProfileHeightCm(result.user.heightCm != null ? String(result.user.heightCm) : '');
        setProfileWeightKg(result.user.weightKg != null ? String(result.user.weightKg) : '');
        setContacts(result.user.emergencyContacts?.length ? result.user.emergencyContacts : [emptyContact()]);
      }
      setProfileMessage('Profile saved.');
    } catch (err) {
      const msg = err?.body?.error || err?.message || 'Failed to save profile';
      setProfileMessage(msg);
    } finally {
      setProfileLoading(false);
    }
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandText}>Triage</span><span className={styles.brandHighlight}>Sense</span>
        </Link>

        <div className={styles.actions}>
          {!user ? (
            <>
              <button type="button" className={styles.loginBtn} onClick={openLogin}>Log in</button>
              <button type="button" className={styles.signupBtn} onClick={openSignup}>Sign up</button>
            </>
          ) : (
            <>
              <button type="button" className={styles.profileBtn} onClick={openProfile}>Profile</button>
              <button type="button" className={styles.logoutBtn} onClick={logout}>Log out</button>
            </>
          )}
        </div>
      </header>

      <div className={styles.content}>
        <Outlet />
      </div>

      {authOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{authTitle}</h2>
            <form onSubmit={submitAuth} className={styles.form}>
              {authMode === 'signup' && (
                <label className={styles.field}>
                  <span>Name</span>
                  <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} required />
                </label>
              )}
              <label className={styles.field}>
                <span>Email</span>
                <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>Password</span>
                <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required minLength={8} />
              </label>

              {authError && <p className={styles.errorText}>{authError}</p>}

              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={closeAuth}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={authLoading}>
                  {authLoading ? 'Please wait...' : authTitle}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {profileOpen && user && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modalLarge}>
            <h2 className={styles.modalTitle}>Your profile</h2>
            <form onSubmit={saveProfile} className={styles.form}>
              <label className={styles.field}>
                <span>Name</span>
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
              </label>

              <div className={styles.profileGrid}>
                <label className={styles.field}>
                  <span>Age</span>
                  <input
                    type="number"
                    min={1}
                    max={130}
                    value={profileAge}
                    onChange={(e) => setProfileAge(e.target.value)}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Gender</span>
                  <select
                    value={profileGender}
                    onChange={(e) => setProfileGender(e.target.value)}
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Height (cm)</span>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    value={profileHeightCm}
                    onChange={(e) => setProfileHeightCm(e.target.value)}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Weight (kg)</span>
                  <input
                    type="number"
                    min={2}
                    max={500}
                    value={profileWeightKg}
                    onChange={(e) => setProfileWeightKg(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>Email</span>
                <input value={user.email} disabled />
              </label>

              <div className={styles.contactsHeader}>
                <h3>Emergency contacts</h3>
                <button type="button" className={styles.ghostBtn} onClick={addContact}>Add contact</button>
              </div>

              {contacts.map((contact, index) => (
                <div key={index} className={styles.contactCard}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      value={contact.name || ''}
                      onChange={(e) => updateContact(index, 'name', e.target.value)}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Relation</span>
                    <input
                      value={contact.relation || ''}
                      onChange={(e) => updateContact(index, 'relation', e.target.value)}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Phone</span>
                    <input
                      value={contact.phone || ''}
                      onChange={(e) => updateContact(index, 'phone', e.target.value)}
                      required
                    />
                  </label>
                  {contacts.length > 1 && (
                    <button type="button" className={styles.removeBtn} onClick={() => removeContact(index)}>Remove</button>
                  )}
                </div>
              ))}

              {profileMessage && <p className={styles.infoText}>{profileMessage}</p>}

              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={closeProfile}>Close</button>
                <button type="submit" className={styles.primaryBtn} disabled={profileLoading}>
                  {profileLoading ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
