import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Ranked.module.css';

export default function Ranked() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;

  useEffect(() => {
    if (!state?.top3) {
      navigate('/', { replace: true });
    }
  }, [state, navigate]);

  if (!state?.top3) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  const top3 = state.top3;

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate('/')}
        aria-label="Back to start"
      >
        ← Start over
      </button>

      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          Best hospitals. <span className={styles.highlight}>Ranked for you.</span>
        </h1>
        <p className={styles.pageSubtitle}>
          Total time = drive time + wait time. Lower is better.
        </p>
      </header>

      <section className={styles.list} aria-label="Top 3 hospitals">
        {top3.map((hospital, i) => (
          <article key={i} className={styles.card}>
            <span className={styles.rank} aria-hidden="true">
              {i + 1}
            </span>
            <div className={styles.content}>
              <h3 className={styles.name}>{hospital.name}</h3>
              <p className={styles.time}>
                Total time: <strong>{hospital.totalTime} minutes</strong>
              </p>
            </div>
          </article>
        ))}
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => navigate('/')}
        >
          Start over
        </button>
      </div>
    </div>
  );
}
