import { Outlet, Link } from 'react-router-dom';
import styles from './Layout.module.css';

export default function Layout() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandText}>Triage</span><span className={styles.brandHighlight}>Sense</span>
        </Link>
      </header>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
