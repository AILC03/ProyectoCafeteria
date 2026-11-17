import React, { useState, useEffect } from 'react';

export default function WelcomeScreen({ onStart, onOpenMenu, theme, businessName }) {
  const [liveDate, setLiveDate] = useState('');
  const [liveTime, setLiveTime] = useState('');

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];

      const formattedDate = `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} ${now.getFullYear()}`;

      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const hoursFormatted = String(hours).padStart(2, '0');

      setLiveDate(formattedDate);
      setLiveTime(`${hoursFormatted}:${minutes} ${ampm}`);
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="screen-welcome" className="screen-view active" aria-label="Pantalla de Bienvenida">
      <div className="welcome-left">
        <div className="welcome-title-wrap">
          <h1 className="welcome-app-name" id="main-brand-title">
            {businessName || 'Coffee´s Pos'}
          </h1>
          <p className="welcome-subtitle">
            {businessName ? 'Coffee´s Pos • Toma de Órdenes' : 'Toma de Órdenes'}
          </p>
        </div>

        <button
          type="button"
          className="btn-empezar"
          id="btn-start"
          onClick={onStart}
          aria-label="Empezar turno o iniciar sesión"
        >
          <span>EMPEZAR</span>
        </button>

        <button
          type="button"
          className="welcome-menu-btn"
          id="btn-open-menu"
          onClick={onOpenMenu}
          aria-label="Abrir menú de configuración y opciones"
        >
          <div className="hamburger-line"></div>
          <div className="hamburger-line"></div>
          <div className="hamburger-line"></div>
        </button>
      </div>

      <div className={`welcome-right ${theme}`} id="welcome-right-panel">
        <div className="welcome-clock-box">
          <div className="welcome-date-text" id="live-date">
            {liveDate || 'Cargando fecha...'}
          </div>
          <div className="welcome-time-text" id="live-time">
            {liveTime || '--:-- --'}
          </div>
        </div>
      </div>
    </section>
  );
}
