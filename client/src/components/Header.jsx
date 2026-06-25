import { logout } from '../api/authClient.js';

export default function Header({ user }) {
  return (
    <header className="header">
      <div className="header-inner">
        <h1>Flensa Calls Report</h1>
        <div className="header-actions">
          {user ? (
            <>
              <span className="user-name">{user.name || user.email}</span>
              <button type="button" onClick={() => logout().then(() => window.location.reload())}>
                Log out
              </button>
            </>
          ) : (
            <span className="user-name">Not signed in</span>
          )}
        </div>
      </div>
    </header>
  );
}
