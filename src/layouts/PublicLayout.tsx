import { Link, Outlet } from 'react-router-dom';
import { BrandLogo } from '../components/Brand';
import { useAuth } from '../context/AuthContext';

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <BrandLogo />
          <nav className="nav-links" aria-label="Principal">
            <a href={`${import.meta.env.BASE_URL}#disenos`} className="hide-mobile">Diseños</a>
            <a href={`${import.meta.env.BASE_URL}#arma-tu-tarjeta`} className="hide-mobile">Probalo</a>
            <a href={`${import.meta.env.BASE_URL}#como-funciona`} className="hide-mobile">Cómo funciona</a>
            <a href={`${import.meta.env.BASE_URL}#precios`} className="hide-mobile">Precios</a>
            <a href={`${import.meta.env.BASE_URL}#preguntas`} className="hide-mobile">Preguntas</a>
            {user ? (
              <Link to="/inicio" className="btn btn-primary btn-sm">Mi cuenta</Link>
            ) : (
              <>
                <Link to="/ingresar">Ingresar</Link>
                <Link to="/registro" className="btn btn-primary btn-sm">Probar gratis</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="container row-between">
          <div className="stack-sm">
            <BrandLogo />
            <span>Fidelización digital para comercios de Argentina.</span>
          </div>
          <nav className="row" aria-label="Legal">
            <Link to="/terminos">Términos y condiciones</Link>
            <Link to="/privacidad">Política de privacidad</Link>
            <a href={`${import.meta.env.BASE_URL}#contacto`}>Contacto</a>
          </nav>
        </div>
        <div className="container mt-2 small subtle">© {new Date().getFullYear()} NOVANTIQ. Todos los derechos reservados.</div>
      </footer>
    </>
  );
}
