import { logout } from '../api/authClient.js';

export default function Header({ user }) {
  return (
    <header className="header no-print">
      <div className="header-inner">
        <h1>Reportes</h1>
        <div className="header-actions">
          {user ? (
            <>
              <span className="user-name">{user.name || user.email}</span>
              <button type="button" onClick={() => logout().then(() => window.location.reload())}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <span className="user-name">Sin sesión</span>
          )}
        </div>
      </div>
    </header>
  );
}
